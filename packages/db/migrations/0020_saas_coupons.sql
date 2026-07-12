CREATE TABLE IF NOT EXISTS saas_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(48) NOT NULL UNIQUE,
  discount_type varchar(12) NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value_cents integer NOT NULL CHECK (discount_value_cents > 0),
  max_redemptions integer,
  redemption_count integer NOT NULL DEFAULT 0,
  allowed_plan_slugs jsonb NOT NULL DEFAULT '[]',
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES saas_coupons(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  discount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, tenant_id)
);
