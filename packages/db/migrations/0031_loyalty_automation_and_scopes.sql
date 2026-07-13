ALTER TABLE loyalty_campaigns
  ADD COLUMN IF NOT EXISTS product_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_redemption_points integer,
  ADD COLUMN IF NOT EXISTS approval_threshold_points integer,
  ADD COLUMN IF NOT EXISTS automation_type varchar(32),
  ADD COLUMN IF NOT EXISTS automation_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inactivity_days integer;

ALTER TABLE loyalty_redemptions
  ADD COLUMN IF NOT EXISTS reward_id uuid REFERENCES loyalty_rewards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS loyalty_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES loyalty_campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  automation_type varchar(32) NOT NULL,
  period_key varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, customer_id, automation_type, period_key)
);

CREATE INDEX IF NOT EXISTS loyalty_campaigns_scope_idx
  ON loyalty_campaigns (tenant_id, is_active, branch_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS loyalty_automation_runs_tenant_idx
  ON loyalty_automation_runs (tenant_id, created_at DESC);
