-- Operational command center, branch integration overrides and alert lifecycle.

CREATE TABLE IF NOT EXISTS branch_integration_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  provider varchar(80) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, provider)
);
CREATE INDEX IF NOT EXISTS branch_integration_overrides_lookup_idx
  ON branch_integration_overrides (tenant_id, branch_id, provider);

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS escalation_hours integer NOT NULL DEFAULT 24;

ALTER TABLE alert_events
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS severity varchar(16) NOT NULL DEFAULT 'warning',
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES operational_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE alert_events DROP CONSTRAINT IF EXISTS alert_events_severity_check;
ALTER TABLE alert_events ADD CONSTRAINT alert_events_severity_check
  CHECK (severity IN ('info', 'warning', 'critical'));
CREATE INDEX IF NOT EXISTS alert_events_open_idx
  ON alert_events (tenant_id, branch_id, severity, created_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE branch_integration_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_integration_overrides_tenant_policy ON branch_integration_overrides;
CREATE POLICY branch_integration_overrides_tenant_policy ON branch_integration_overrides
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
