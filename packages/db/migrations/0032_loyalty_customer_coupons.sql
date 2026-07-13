CREATE TABLE IF NOT EXISTS loyalty_customer_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_id uuid REFERENCES loyalty_rewards(id) ON DELETE SET NULL,
  code varchar(64) NOT NULL,
  value_amount numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(24) NOT NULL DEFAULT 'available' CHECK (status IN ('available','redeemed','expired','cancelled')),
  expires_at timestamptz,
  issued_sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  redeemed_sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS loyalty_customer_coupons_available_idx
  ON loyalty_customer_coupons (tenant_id, customer_id, status, expires_at);

ALTER TABLE loyalty_customer_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON loyalty_customer_coupons;
CREATE POLICY tenant_isolation ON loyalty_customer_coupons
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
