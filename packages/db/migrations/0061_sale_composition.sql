DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_tenant_id_key') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_tenant_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS composition_fingerprint char(64),
  ADD CONSTRAINT sales_composition_fingerprint_format
    CHECK (composition_fingerprint IS NULL OR composition_fingerprint ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE pricing_approvals
  ADD COLUMN IF NOT EXISTS basket_fingerprint char(64),
  ADD COLUMN IF NOT EXISTS requested_allocated_adjustment_amount numeric(12,2) NOT NULL DEFAULT 0
    CHECK (requested_allocated_adjustment_amount >= 0),
  ADD CONSTRAINT pricing_approvals_basket_fingerprint_format
    CHECK (basket_fingerprint IS NULL OR basket_fingerprint ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE idempotency_keys
  ADD COLUMN IF NOT EXISTS request_hash char(64),
  ADD CONSTRAINT idempotency_keys_request_hash_format
    CHECK (request_hash IS NULL OR request_hash ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS allocated_adjustment_amount numeric(12,2) NOT NULL DEFAULT 0
    CHECK (allocated_adjustment_amount >= 0),
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2)
    CHECK (net_amount IS NULL OR net_amount >= 0),
  ADD COLUMN IF NOT EXISTS final_margin_percent numeric(9,4);

CREATE TABLE IF NOT EXISTS sale_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  adjustment_key varchar(120) NOT NULL,
  adjustment_type varchar(32) NOT NULL CHECK (adjustment_type IN (
    'item_discount', 'loyalty_points', 'loyalty_coupon', 'loyalty_reward', 'customer_credit',
    'promotion', 'bonus_product'
  )),
  source_type varchar(40) NOT NULL,
  source_id varchar(120),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  basket_fingerprint char(64) NOT NULL CHECK (basket_fingerprint ~ '^[0-9a-f]{64}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_adjustments_tenant_sale_id_key UNIQUE (tenant_id, sale_id, id),
  CONSTRAINT sale_adjustments_tenant_sale_key UNIQUE (tenant_id, sale_id, adjustment_key),
  CONSTRAINT sale_adjustments_tenant_sale_fk
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sale_item_adjustments (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  adjustment_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sale_id, sale_item_id, adjustment_id),
  CONSTRAINT sale_item_adjustments_tenant_sale_item_fk
    FOREIGN KEY (tenant_id, sale_id, sale_item_id)
    REFERENCES sale_items (tenant_id, sale_id, id) ON DELETE CASCADE,
  CONSTRAINT sale_item_adjustments_tenant_sale_adjustment_fk
    FOREIGN KEY (tenant_id, sale_id, adjustment_id)
    REFERENCES sale_adjustments (tenant_id, sale_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sale_adjustments_tenant_sale_idx
  ON sale_adjustments (tenant_id, sale_id, created_at);
CREATE INDEX IF NOT EXISTS sale_item_adjustments_tenant_item_idx
  ON sale_item_adjustments (tenant_id, sale_item_id);
CREATE INDEX IF NOT EXISTS pricing_approvals_tenant_fingerprint_idx
  ON pricing_approvals (tenant_id, basket_fingerprint, status, expires_at)
  WHERE basket_fingerprint IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_sale_item_pricing_snapshot_update() RETURNS trigger AS $$
BEGIN
  IF ROW(
    OLD.price_policy_id, OLD.price_policy_version, OLD.price_reference, OLD.price_min, OLD.price_max,
    OLD.cost_snapshot, OLD.projected_margin_percent, OLD.pricing_exception_reason,
    OLD.pricing_exception_requested_by_user_id, OLD.pricing_exception_approved_by_user_id,
    OLD.pricing_approval_id, OLD.allocated_adjustment_amount, OLD.net_amount, OLD.final_margin_percent
  ) IS DISTINCT FROM ROW(
    NEW.price_policy_id, NEW.price_policy_version, NEW.price_reference, NEW.price_min, NEW.price_max,
    NEW.cost_snapshot, NEW.projected_margin_percent, NEW.pricing_exception_reason,
    NEW.pricing_exception_requested_by_user_id, NEW.pricing_exception_approved_by_user_id,
    NEW.pricing_approval_id, NEW.allocated_adjustment_amount, NEW.net_amount, NEW.final_margin_percent
  ) THEN
    RAISE EXCEPTION 'Os snapshots economicos de um item vendido sao imutaveis.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_sale_adjustment_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Os ajustes monetarios de uma venda sao imutaveis.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sale_adjustments_immutable ON sale_adjustments;
CREATE TRIGGER sale_adjustments_immutable
  BEFORE UPDATE ON sale_adjustments
  FOR EACH ROW EXECUTE FUNCTION prevent_sale_adjustment_update();

DROP TRIGGER IF EXISTS sale_item_adjustments_immutable ON sale_item_adjustments;
CREATE TRIGGER sale_item_adjustments_immutable
  BEFORE UPDATE ON sale_item_adjustments
  FOR EACH ROW EXECUTE FUNCTION prevent_sale_adjustment_update();

ALTER TABLE sale_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_item_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON sale_adjustments;
CREATE POLICY tenant_isolation ON sale_adjustments
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON sale_item_adjustments;
CREATE POLICY tenant_isolation ON sale_item_adjustments
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
