CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope varchar(80) NOT NULL,
  key varchar(128) NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(tenant_id, scope, key)
);

CREATE TABLE IF NOT EXISTS operational_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  description varchar(1000),
  type varchar(50) NOT NULL DEFAULT 'general',
  status varchar(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  priority varchar(16) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_at timestamptz,
  recurrence varchar(32),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idempotency_keys_tenant_created_idx ON idempotency_keys(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_tasks_tenant_status_idx ON operational_tasks(tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS operational_tasks_assignee_idx ON operational_tasks(tenant_id, assignee_user_id, status);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_tenant_policy ON idempotency_keys USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY operational_tasks_tenant_policy ON operational_tasks USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
