-- Persistent operational controls and a PostgreSQL-backed worker queue.
CREATE OR REPLACE FUNCTION app_operational_system() RETURNS boolean AS $$
  SELECT current_setting('app.operational_system', true) = 'true';
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS platform_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(120) NOT NULL UNIQUE,
  description text,
  default_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_feature_flag_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_flag_id uuid NOT NULL REFERENCES platform_feature_flags(id) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_flag_id)
);
CREATE INDEX IF NOT EXISTS tenant_feature_flag_overrides_lookup_idx
  ON tenant_feature_flag_overrides (tenant_id, feature_flag_id);

CREATE TABLE IF NOT EXISTS configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  configuration_key varchar(120) NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  value jsonb NOT NULL DEFAULT '{}',
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id, configuration_key, version)
);
CREATE INDEX IF NOT EXISTS configuration_versions_lookup_idx
  ON configuration_versions (tenant_id, branch_id, configuration_key, version DESC);

CREATE TABLE IF NOT EXISTS operational_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  event_type varchar(120) NOT NULL,
  aggregate_type varchar(120),
  aggregate_id uuid,
  idempotency_key varchar(160) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS operational_events_pending_idx
  ON operational_events (tenant_id, occurred_at)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS operational_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  type varchar(120) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  idempotency_key varchar(160) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by varchar(120),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS operational_jobs_idempotency_idx
  ON operational_jobs (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key);
CREATE INDEX IF NOT EXISTS operational_jobs_reservation_idx
  ON operational_jobs (available_at, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS operational_jobs_tenant_status_idx
  ON operational_jobs (tenant_id, status, available_at DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(80) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'verified', 'failed')),
  artifact_uri text,
  checksum varchar(160),
  byte_count bigint CHECK (byte_count IS NULL OR byte_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  verified_at timestamptz,
  restore_tested_at timestamptz,
  verification_error text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backup_runs_recent_idx
  ON backup_runs (started_at DESC);

ALTER TABLE tenant_feature_flag_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuration_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_jobs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_feature_flag_overrides',
    'configuration_versions',
    'operational_events',
    'operational_jobs'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id() OR app_operational_system()) WITH CHECK (tenant_id = app_tenant_id() OR app_operational_system())',
        table_name
      );
    END IF;
  END LOOP;
END $$;
