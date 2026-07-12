CREATE TABLE IF NOT EXISTS platform_support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operator_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason varchar(1000) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_support_sessions_tenant_idx
  ON platform_support_sessions(tenant_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_logs_created_at_idx
  ON platform_audit_logs(created_at DESC);
