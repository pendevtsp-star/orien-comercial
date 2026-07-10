CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name varchar(180) NOT NULL,
  document varchar(20),
  email varchar(255),
  phone varchar(30),
  whatsapp varchar(30),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_document_idx ON suppliers (tenant_id, document) WHERE document IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS suppliers_tenant_name_idx ON suppliers (tenant_id, name) WHERE deleted_at IS NULL;

ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS document_number varchar(80);
ALTER TABLE purchase_entries ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'received';

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  status varchar(32) NOT NULL DEFAULT 'draft',
  expected_at date,
  notes varchar(500),
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL,
  unit_cost numeric(12,2) NOT NULL,
  received_quantity numeric(12,3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cash_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  opened_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  opening_amount numeric(12,2) NOT NULL DEFAULT 0,
  expected_amount numeric(12,2) NOT NULL DEFAULT 0,
  closing_amount numeric(12,2),
  difference_amount numeric(12,2),
  status varchar(24) NOT NULL DEFAULT 'open',
  notes varchar(500),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS cash_register_sessions_tenant_branch_status_idx ON cash_register_sessions (tenant_id, branch_id, status);

CREATE TABLE IF NOT EXISTS branch_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sales_target numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_goals_period_check CHECK (period_end >= period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS branch_goals_tenant_branch_period_idx ON branch_goals (tenant_id, branch_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS seller_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  rate_percent numeric(5,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_commission_rate_check CHECK (rate_percent >= 0 AND rate_percent <= 100)
);

CREATE TABLE IF NOT EXISTS seller_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sale_id, user_id)
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type varchar(60) NOT NULL,
  channel varchar(24) NOT NULL,
  recipient varchar(255) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES alert_rules(id) ON DELETE SET NULL,
  type varchar(60) NOT NULL,
  channel varchar(24) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  failure_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type varchar(32) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'preview',
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
