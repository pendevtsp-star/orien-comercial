ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS cash_register_session_id uuid REFERENCES cash_register_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_cash_register_session_idx
  ON sales (tenant_id, cash_register_session_id)
  WHERE cash_register_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cash_register_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cash_register_session_id uuid NOT NULL REFERENCES cash_register_sessions(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  type varchar(24) NOT NULL,
  amount numeric(12,2) NOT NULL,
  reason varchar(180) NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_register_movements_type_check CHECK (type IN ('supply', 'withdrawal')),
  CONSTRAINT cash_register_movements_amount_check CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS cash_register_movements_session_idx
  ON cash_register_movements (tenant_id, cash_register_session_id, created_at);

ALTER TABLE purchase_entries
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_orders_tenant_status_idx
  ON purchase_orders (tenant_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
