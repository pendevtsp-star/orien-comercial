ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE cash_register_sessions
  ADD COLUMN IF NOT EXISTS blind_closing_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS approval_status varchar(24) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE TABLE IF NOT EXISTS sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id), sale_id uuid NOT NULL REFERENCES sales(id), customer_id uuid REFERENCES customers(id),
  status varchar(24) NOT NULL DEFAULT 'completed', reason varchar(300) NOT NULL, refund_method varchar(24) NOT NULL,
  total_amount numeric(12,2) NOT NULL, actor_user_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE, sale_item_id uuid NOT NULL REFERENCES sale_items(id),
  product_id uuid NOT NULL REFERENCES products(id), quantity numeric(12,3) NOT NULL, unit_amount numeric(12,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id), branch_id uuid REFERENCES branches(id), source_return_id uuid REFERENCES sale_returns(id),
  amount numeric(12,2) NOT NULL, balance numeric(12,2) NOT NULL, status varchar(24) NOT NULL DEFAULT 'available',
  expires_at date, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id), name varchar(120) NOT NULL, customer_group varchar(80), starts_at timestamptz, ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,name)
);
CREATE TABLE IF NOT EXISTS price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  price_table_id uuid NOT NULL REFERENCES price_tables(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES products(id),
  min_quantity numeric(12,3) NOT NULL DEFAULT 1, fixed_price numeric(12,2), discount_percent numeric(5,2), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fixed_price IS NOT NULL OR discount_percent IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id), customer_id uuid REFERENCES customers(id), seller_user_id uuid REFERENCES users(id),
  status varchar(24) NOT NULL DEFAULT 'draft', total_amount numeric(12,2) NOT NULL DEFAULT 0, valid_until date NOT NULL,
  notes varchar(500), converted_sale_id uuid REFERENCES sales(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES products(id),
  description varchar(180) NOT NULL, quantity numeric(12,3) NOT NULL, unit_price numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0, reserved_quantity numeric(12,3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customer_credit_accounts (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0, blocked boolean NOT NULL DEFAULT false, block_reason varchar(300),
  updated_by_user_id uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS credit_renegotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id), original_amount numeric(12,2) NOT NULL, negotiated_amount numeric(12,2) NOT NULL,
  installments integer NOT NULL, first_due_date date NOT NULL, actor_user_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, branch_id uuid REFERENCES branches(id), type varchar(40) NOT NULL,
  title varchar(180) NOT NULL, message varchar(500) NOT NULL, severity varchar(16) NOT NULL DEFAULT 'info',
  entity_type varchar(60), entity_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_returns_tenant_sale_idx ON sale_returns(tenant_id,sale_id,created_at DESC);
CREATE INDEX IF NOT EXISTS price_rules_lookup_idx ON price_rules(tenant_id,product_id,min_quantity DESC);
CREATE INDEX IF NOT EXISTS quotes_tenant_status_idx ON quotes(tenant_id,status,valid_until);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON internal_notifications(tenant_id,user_id,read_at,created_at DESC);

ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_renegotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_notifications ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['sale_returns','sale_return_items','customer_credits','price_tables','price_rules','quotes','quote_items','customer_credit_accounts','credit_renegotiations','internal_notifications'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id())',table_name);
  END LOOP;
END $$;
