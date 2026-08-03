ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

CREATE INDEX IF NOT EXISTS service_orders_tenant_status_idx
  ON service_orders(tenant_id, status, updated_at DESC);
