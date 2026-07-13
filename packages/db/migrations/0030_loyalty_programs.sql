ALTER TABLE loyalty_campaigns
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_in_days integer,
  ADD COLUMN IF NOT EXISTS minimum_sale_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  minimum_points integer NOT NULL DEFAULT 0 CHECK (minimum_points >= 0),
  multiplier numeric(8,2) NOT NULL DEFAULT 1 CHECK (multiplier > 0),
  benefits text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(140) NOT NULL,
  reward_type varchar(32) NOT NULL CHECK (reward_type IN ('discount','coupon','cashback','bonus_product')),
  points_required integer NOT NULL CHECK (points_required > 0),
  value_amount numeric(12,2) NOT NULL DEFAULT 0,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  coupon_code varchar(64),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_point_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES loyalty_wallets(id) ON DELETE CASCADE,
  source_ledger_id uuid REFERENCES loyalty_ledger(id) ON DELETE SET NULL,
  original_points integer NOT NULL CHECK (original_points > 0),
  remaining_points integer NOT NULL CHECK (remaining_points >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loyalty_campaigns_active_idx ON loyalty_campaigns (tenant_id, is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS loyalty_rewards_active_idx ON loyalty_rewards (tenant_id, is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS loyalty_ledger_expiry_idx ON loyalty_ledger (tenant_id, expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS loyalty_point_lots_available_idx ON loyalty_point_lots (tenant_id, wallet_id, expires_at) WHERE remaining_points > 0;
