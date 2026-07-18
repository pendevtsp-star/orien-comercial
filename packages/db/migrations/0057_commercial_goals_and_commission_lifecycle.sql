-- Metas por vendedor e ciclo completo de comissao provisionada.
CREATE TABLE IF NOT EXISTS seller_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  sales_target numeric(12,2) NOT NULL CHECK (sales_target >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_goals_tenant_user_branch_period_idx
  ON seller_goals (tenant_id, user_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, period_end);
CREATE INDEX IF NOT EXISTS seller_goals_tenant_period_idx
  ON seller_goals (tenant_id, period_start, period_end);

WITH ranked_rules AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY tenant_id, user_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM seller_commission_rules
)
DELETE FROM seller_commission_rules rules
USING ranked_rules ranked
WHERE rules.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS seller_commission_rules_tenant_user_branch_idx
  ON seller_commission_rules (tenant_id, user_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE seller_commissions
  ADD COLUMN IF NOT EXISTS base_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS adjusted_at timestamptz,
  ADD COLUMN IF NOT EXISTS adjustment_reason varchar(300);

UPDATE seller_commissions
SET base_amount = amount
WHERE base_amount IS NULL;

ALTER TABLE seller_goals ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seller_goals' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON seller_goals
      USING (tenant_id = app_tenant_id())
      WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;
