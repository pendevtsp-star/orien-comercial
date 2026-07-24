CREATE TABLE IF NOT EXISTS customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  code varchar(80) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS customer_segments_tenant_active_idx
  ON customer_segments (tenant_id, is_active, name);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_segment_id uuid;
CREATE INDEX IF NOT EXISTS customers_tenant_segment_idx
  ON customers (tenant_id, customer_segment_id)
  WHERE customer_segment_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_tenant_segment_fk'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_tenant_segment_fk
      FOREIGN KEY (tenant_id, customer_segment_id)
      REFERENCES customer_segments (tenant_id, id)
      ON DELETE SET NULL (customer_segment_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_tenant_id_key') THEN
    ALTER TABLE products ADD CONSTRAINT products_tenant_id_key UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_tenant_id_key') THEN
    ALTER TABLE branches ADD CONSTRAINT branches_tenant_id_key UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_tenant_sale_id_key') THEN
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_tenant_sale_id_key UNIQUE (tenant_id, sale_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS price_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  branch_id uuid,
  customer_segment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  min_quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  reference_price numeric(12,2) NOT NULL CHECK (reference_price >= 0),
  min_price numeric(12,2) NOT NULL CHECK (min_price >= 0),
  max_price numeric(12,2) NOT NULL CHECK (max_price >= 0),
  min_margin_percent numeric(9,4),
  margin_mode varchar(24) NOT NULL DEFAULT 'warn'
    CHECK (margin_mode IN ('warn', 'block', 'approval_required')),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 1000),
  version integer NOT NULL CHECK (version > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_price <= reference_price AND reference_price <= max_price),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT price_policies_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT price_policies_tenant_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT price_policies_tenant_branch_fk
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id) ON DELETE SET NULL (branch_id),
  CONSTRAINT price_policies_tenant_segment_fk
    FOREIGN KEY (tenant_id, customer_segment_id) REFERENCES customer_segments (tenant_id, id) ON DELETE SET NULL (customer_segment_id),
  UNIQUE NULLS NOT DISTINCT (
    tenant_id, product_id, branch_id, customer_segment_id, min_quantity, version
  )
);

CREATE INDEX IF NOT EXISTS price_policies_tenant_product_scope_idx
  ON price_policies (tenant_id, product_id, branch_id, customer_segment_id, min_quantity DESC, version DESC)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS price_policies_tenant_validity_idx
  ON price_policies (tenant_id, starts_at, ends_at)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS pricing_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  customer_segment_id uuid,
  price_policy_id uuid,
  price_policy_version integer,
  requested_unit_price numeric(12,2) NOT NULL CHECK (requested_unit_price >= 0),
  requested_discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (requested_discount_amount >= 0),
  requested_total_amount numeric(12,2) NOT NULL CHECK (requested_total_amount >= 0),
  requested_cost_amount numeric(12,2) NOT NULL CHECK (requested_cost_amount >= 0),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  requested_margin_percent numeric(9,4),
  reason varchar(500) NOT NULL,
  requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  decision_reason varchar(500),
  consumed_at timestamptz,
  consumed_sale_id uuid,
  consumed_sale_item_id uuid,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'consumed')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_by_user_id <> approved_by_user_id),
  CHECK (expires_at <= created_at + interval '15 minutes'),
  CONSTRAINT pricing_approvals_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT pricing_approvals_tenant_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pricing_approvals_tenant_branch_fk
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pricing_approvals_tenant_segment_fk
    FOREIGN KEY (tenant_id, customer_segment_id) REFERENCES customer_segments (tenant_id, id) ON DELETE SET NULL (customer_segment_id),
  CONSTRAINT pricing_approvals_tenant_policy_fk
    FOREIGN KEY (tenant_id, price_policy_id) REFERENCES price_policies (tenant_id, id) ON DELETE SET NULL (price_policy_id),
  CONSTRAINT pricing_approvals_tenant_consumed_sale_item_fk
    FOREIGN KEY (tenant_id, consumed_sale_id, consumed_sale_item_id)
    REFERENCES sale_items (tenant_id, sale_id, id),
  CHECK (
    (status = 'pending' AND approved_by_user_id IS NULL AND approved_at IS NULL)
    OR (status IN ('approved', 'rejected') AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)
    OR (status = 'consumed' AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL
      AND consumed_at IS NOT NULL AND consumed_sale_id IS NOT NULL AND consumed_sale_item_id IS NOT NULL)
    OR status = 'expired'
  )
);

CREATE INDEX IF NOT EXISTS pricing_approvals_tenant_requester_idx
  ON pricing_approvals (tenant_id, requested_by_user_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS pricing_approvals_tenant_pending_idx
  ON pricing_approvals (tenant_id, branch_id, status, expires_at)
  WHERE status = 'pending';

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS price_policy_id uuid,
  ADD COLUMN IF NOT EXISTS price_policy_version integer,
  ADD COLUMN IF NOT EXISTS price_reference numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_min numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_max numeric(12,2),
  ADD COLUMN IF NOT EXISTS cost_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS projected_margin_percent numeric(9,4),
  ADD COLUMN IF NOT EXISTS pricing_exception_reason varchar(500),
  ADD COLUMN IF NOT EXISTS pricing_exception_requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_exception_approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_approval_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_tenant_policy_fk') THEN
    ALTER TABLE sale_items
      ADD CONSTRAINT sale_items_tenant_policy_fk
      FOREIGN KEY (tenant_id, price_policy_id)
      REFERENCES price_policies (tenant_id, id)
      ON DELETE SET NULL (price_policy_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_tenant_pricing_approval_fk') THEN
    ALTER TABLE sale_items
      ADD CONSTRAINT sale_items_tenant_pricing_approval_fk
      FOREIGN KEY (tenant_id, pricing_approval_id)
      REFERENCES pricing_approvals (tenant_id, id)
      ON DELETE SET NULL (pricing_approval_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_sale_item_pricing_snapshot_update() RETURNS trigger AS $$
BEGIN
  IF ROW(
    OLD.price_policy_id, OLD.price_policy_version, OLD.price_reference, OLD.price_min, OLD.price_max,
    OLD.cost_snapshot, OLD.projected_margin_percent, OLD.pricing_exception_reason,
    OLD.pricing_exception_requested_by_user_id, OLD.pricing_exception_approved_by_user_id, OLD.pricing_approval_id
  ) IS DISTINCT FROM ROW(
    NEW.price_policy_id, NEW.price_policy_version, NEW.price_reference, NEW.price_min, NEW.price_max,
    NEW.cost_snapshot, NEW.projected_margin_percent, NEW.pricing_exception_reason,
    NEW.pricing_exception_requested_by_user_id, NEW.pricing_exception_approved_by_user_id, NEW.pricing_approval_id
  ) THEN
    RAISE EXCEPTION 'Os snapshots de preço de um item vendido são imutáveis.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sale_items_pricing_snapshot_immutable ON sale_items;
CREATE TRIGGER sale_items_pricing_snapshot_immutable
  BEFORE UPDATE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION prevent_sale_item_pricing_snapshot_update();

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON customer_segments;
CREATE POLICY tenant_isolation ON customer_segments
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON price_policies;
CREATE POLICY tenant_isolation ON price_policies
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON pricing_approvals;
CREATE POLICY tenant_isolation ON pricing_approvals
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

INSERT INTO permissions (slug, description)
VALUES
  ('pricing.policies.manage', 'Gerenciar políticas de preço e segmentos'),
  ('pricing.exceptions.authorize', 'Autorizar exceções de preço e margem')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;

WITH grants(role_slug, permission_slug) AS (
  VALUES
    ('owner', 'pricing.policies.manage'),
    ('owner', 'pricing.exceptions.authorize'),
    ('admin', 'pricing.policies.manage'),
    ('admin', 'pricing.exceptions.authorize'),
    ('manager', 'pricing.policies.manage'),
    ('manager', 'pricing.exceptions.authorize')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r ON r.slug = g.role_slug AND r.deleted_at IS NULL
JOIN permissions p ON p.slug = g.permission_slug
ON CONFLICT DO NOTHING;
