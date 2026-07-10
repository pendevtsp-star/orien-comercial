ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS notes varchar(500),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason varchar(180);

ALTER TABLE sale_payments
  ADD COLUMN IF NOT EXISTS reference_code varchar(120),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz DEFAULT now();

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS description varchar(220),
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS installment_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_total integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method varchar(60),
  ADD COLUMN IF NOT EXISTS reconciliation_status varchar(40) NOT NULL DEFAULT 'pending';

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS description varchar(220),
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS installment_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_total integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method varchar(60),
  ADD COLUMN IF NOT EXISTS reconciliation_status varchar(40) NOT NULL DEFAULT 'pending';

ALTER TABLE financial_categories
  ADD CONSTRAINT financial_categories_tenant_name_type_unique UNIQUE (tenant_id, name, type);

ALTER TABLE accounts_receivable
  ADD CONSTRAINT accounts_receivable_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE SET NULL;

ALTER TABLE accounts_payable
  ADD CONSTRAINT accounts_payable_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stock_transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_count_id uuid NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  counted_quantity numeric(12,3) NOT NULL,
  system_quantity numeric(12,3) NOT NULL,
  difference_quantity numeric(12,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_name varchar(180) NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_entry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_entry_id uuid NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL,
  unit_cost numeric(12,2) NOT NULL
);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS external_customer_id varchar(120),
  ADD COLUMN IF NOT EXISTS last_webhook_event_id varchar(160);

ALTER TABLE subscription_invoices
  ADD COLUMN IF NOT EXISTS external_reference varchar(120),
  ADD COLUMN IF NOT EXISTS invoice_url text;

INSERT INTO plans (slug, name, price_cents, is_active)
VALUES
  ('starter', 'Starter', 9900, true),
  ('pro', 'Pro', 19900, true),
  ('enterprise', 'Enterprise', 39900, true)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, price_cents = EXCLUDED.price_cents, is_active = EXCLUDED.is_active, updated_at = now();

INSERT INTO permissions (slug, description)
VALUES
  ('users.memberships.manage', 'users memberships manage'),
  ('stock.inventory', 'stock inventory'),
  ('stock.purchase', 'stock purchase'),
  ('stock.reports', 'stock reports'),
  ('sales.history', 'sales history'),
  ('financial.reconcile', 'financial reconcile'),
  ('financial.categories.manage', 'financial categories manage'),
  ('subscriptions.read', 'subscriptions read'),
  ('subscriptions.manage', 'subscriptions manage'),
  ('subscriptions.webhook', 'subscriptions webhook')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;
