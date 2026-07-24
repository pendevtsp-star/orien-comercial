DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_tenant_id_key') THEN
    ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_tenant_id_key UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_receivable_tenant_id_key') THEN
    ALTER TABLE accounts_receivable ADD CONSTRAINT accounts_receivable_tenant_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_acquirers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid,
  name varchar(120) NOT NULL,
  code varchar(60) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_acquirers_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payment_acquirers_tenant_branch_fk FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches (tenant_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_acquirers_tenant_scope_code_key
  ON payment_acquirers (tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
CREATE INDEX IF NOT EXISTS payment_acquirers_tenant_branch_idx
  ON payment_acquirers (tenant_id, branch_id, is_active, name);

CREATE TABLE IF NOT EXISTS payment_fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  acquirer_id uuid NOT NULL,
  payment_method varchar(60) NOT NULL,
  brand varchar(60),
  installment_from integer NOT NULL DEFAULT 1,
  installment_to integer NOT NULL DEFAULT 1,
  percentage_basis_points integer NOT NULL DEFAULT 0,
  fixed_fee numeric(12,2) NOT NULL DEFAULT 0,
  anticipation_basis_points integer NOT NULL DEFAULT 0,
  settlement_days integer NOT NULL DEFAULT 0,
  version integer NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  supersedes_rule_id uuid,
  deactivated_at timestamptz,
  deactivated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  deactivation_reason varchar(240),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_fee_rules_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payment_fee_rules_tenant_acquirer_fk FOREIGN KEY (tenant_id, acquirer_id)
    REFERENCES payment_acquirers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_fee_rules_tenant_supersedes_fk FOREIGN KEY (tenant_id, supersedes_rule_id)
    REFERENCES payment_fee_rules (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_fee_rules_installments_check CHECK (installment_from >= 1 AND installment_to >= installment_from),
  CONSTRAINT payment_fee_rules_percentage_check CHECK (percentage_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT payment_fee_rules_anticipation_check CHECK (anticipation_basis_points BETWEEN 0 AND 10000),
  CONSTRAINT payment_fee_rules_fixed_fee_check CHECK (fixed_fee >= 0),
  CONSTRAINT payment_fee_rules_settlement_days_check CHECK (settlement_days BETWEEN 0 AND 3650),
  CONSTRAINT payment_fee_rules_validity_check CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CONSTRAINT payment_fee_rules_deactivation_check CHECK (
    (is_active AND deactivated_at IS NULL AND deactivation_reason IS NULL)
    OR (NOT is_active AND deactivated_at IS NOT NULL AND deactivation_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_fee_rules_version_key
  ON payment_fee_rules (
    tenant_id, acquirer_id, payment_method, COALESCE(brand, ''), installment_from, installment_to, version
  );
CREATE INDEX IF NOT EXISTS payment_fee_rules_resolution_idx
  ON payment_fee_rules (tenant_id, acquirer_id, payment_method, brand, is_active, valid_from DESC, version DESC);

CREATE OR REPLACE FUNCTION prevent_payment_fee_rule_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.acquirer_id IS DISTINCT FROM OLD.acquirer_id
    OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.brand IS DISTINCT FROM OLD.brand
    OR NEW.installment_from IS DISTINCT FROM OLD.installment_from
    OR NEW.installment_to IS DISTINCT FROM OLD.installment_to
    OR NEW.percentage_basis_points IS DISTINCT FROM OLD.percentage_basis_points
    OR NEW.fixed_fee IS DISTINCT FROM OLD.fixed_fee
    OR NEW.anticipation_basis_points IS DISTINCT FROM OLD.anticipation_basis_points
    OR NEW.settlement_days IS DISTINCT FROM OLD.settlement_days
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
    OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    OR NEW.supersedes_rule_id IS DISTINCT FROM OLD.supersedes_rule_id
  THEN
    RAISE EXCEPTION 'payment fee rule commercial fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_fee_rules_commercial_immutable ON payment_fee_rules;
CREATE TRIGGER payment_fee_rules_commercial_immutable BEFORE UPDATE ON payment_fee_rules
FOR EACH ROW EXECUTE FUNCTION prevent_payment_fee_rule_mutation();

ALTER TABLE sale_payments
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS acquirer_id uuid,
  ADD COLUMN IF NOT EXISTS fee_rule_id uuid,
  ADD COLUMN IF NOT EXISTS fee_rule_version integer,
  ADD COLUMN IF NOT EXISTS brand varchar(60),
  ADD COLUMN IF NOT EXISTS installments integer,
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS processing_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS anticipation_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS total_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS expected_settlement_date date,
  ADD COLUMN IF NOT EXISTS settlement_status varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reconciliation_status varchar(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS snapshot_locked_at timestamptz;

UPDATE sale_payments sp
SET branch_id = s.branch_id,
    installments = COALESCE(sp.installments, 1),
    gross_amount = COALESCE(sp.gross_amount, sp.amount),
    processing_fee_amount = COALESCE(sp.processing_fee_amount, 0),
    anticipation_fee_amount = COALESCE(sp.anticipation_fee_amount, 0),
    total_fee_amount = COALESCE(sp.total_fee_amount, 0),
    net_amount = COALESCE(sp.net_amount, sp.amount),
    expected_settlement_date = COALESCE(sp.expected_settlement_date, COALESCE(sp.paid_at, sp.created_at)::date),
    snapshot_locked_at = COALESCE(sp.snapshot_locked_at, now())
FROM sales s
WHERE s.tenant_id = sp.tenant_id AND s.id = sp.sale_id AND sp.snapshot_locked_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_tenant_branch_fk') THEN
    ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_tenant_branch_fk
      FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_tenant_acquirer_fk') THEN
    ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_tenant_acquirer_fk
      FOREIGN KEY (tenant_id, acquirer_id) REFERENCES payment_acquirers (tenant_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_tenant_fee_rule_fk') THEN
    ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_tenant_fee_rule_fk
      FOREIGN KEY (tenant_id, fee_rule_id) REFERENCES payment_fee_rules (tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS sale_payment_id uuid,
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS expected_settlement_date date,
  ADD COLUMN IF NOT EXISTS effective_settlement_at timestamptz,
  ADD COLUMN IF NOT EXISTS snapshot_locked_at timestamptz;

UPDATE accounts_receivable
SET gross_amount = COALESCE(gross_amount, amount),
    fee_amount = COALESCE(fee_amount, 0),
    net_amount = COALESCE(net_amount, amount),
    expected_settlement_date = COALESCE(expected_settlement_date, due_date),
    snapshot_locked_at = COALESCE(snapshot_locked_at, now())
WHERE snapshot_locked_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_settlement_status_check') THEN
    ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_settlement_status_check
      CHECK (settlement_status IN ('pending', 'partially_settled', 'settled', 'diverged', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_reconciliation_status_check') THEN
    ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_reconciliation_status_check
      CHECK (reconciliation_status IN ('pending', 'reconciled', 'diverged'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_snapshot_amounts_check') THEN
    ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_snapshot_amounts_check CHECK (
      snapshot_locked_at IS NULL OR (
        gross_amount IS NOT NULL AND processing_fee_amount IS NOT NULL AND anticipation_fee_amount IS NOT NULL
        AND total_fee_amount IS NOT NULL AND net_amount IS NOT NULL AND installments >= 1
        AND gross_amount >= 0 AND processing_fee_amount >= 0 AND anticipation_fee_amount >= 0
        AND total_fee_amount = processing_fee_amount + anticipation_fee_amount
        AND gross_amount = net_amount + total_fee_amount
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_receivable_snapshot_amounts_check') THEN
    ALTER TABLE accounts_receivable ADD CONSTRAINT accounts_receivable_snapshot_amounts_check CHECK (
      snapshot_locked_at IS NULL OR (
        gross_amount IS NOT NULL AND fee_amount IS NOT NULL AND net_amount IS NOT NULL
        AND gross_amount >= 0 AND fee_amount >= 0 AND gross_amount = net_amount + fee_amount
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_receivable_tenant_sale_payment_fk') THEN
    ALTER TABLE accounts_receivable ADD CONSTRAINT accounts_receivable_tenant_sale_payment_fk
      FOREIGN KEY (tenant_id, sale_payment_id) REFERENCES sale_payments (tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_receivable_tenant_sale_payment_key
  ON accounts_receivable (tenant_id, sale_payment_id)
  WHERE sale_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  receivable_id uuid,
  settled_amount numeric(12,2) NOT NULL,
  effective_at timestamptz NOT NULL,
  external_reference varchar(180) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'posted',
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reversed_settlement_id uuid,
  notes varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_settlements_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payment_settlements_tenant_external_key UNIQUE (tenant_id, external_reference),
  CONSTRAINT payment_settlements_tenant_branch_fk FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_settlements_tenant_payment_fk FOREIGN KEY (tenant_id, payment_id)
    REFERENCES sale_payments (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_settlements_tenant_receivable_fk FOREIGN KEY (tenant_id, receivable_id)
    REFERENCES accounts_receivable (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_settlements_tenant_reversal_fk FOREIGN KEY (tenant_id, reversed_settlement_id)
    REFERENCES payment_settlements (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payment_settlements_amount_check CHECK (settled_amount > 0),
  CONSTRAINT payment_settlements_status_check CHECK (status IN ('posted', 'reversed'))
);

CREATE INDEX IF NOT EXISTS payment_settlements_tenant_branch_idx
  ON payment_settlements (tenant_id, branch_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS payment_settlements_tenant_payment_idx
  ON payment_settlements (tenant_id, payment_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS payment_settlements_tenant_reversal_key
  ON payment_settlements (tenant_id, reversed_settlement_id)
  WHERE reversed_settlement_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reconciliation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  acquirer_id uuid NOT NULL,
  external_reference varchar(180) NOT NULL,
  request_hash char(64) NOT NULL,
  statement_date date,
  status varchar(32) NOT NULL DEFAULT 'processing',
  expected_amount numeric(12,2) NOT NULL DEFAULT 0,
  actual_amount numeric(12,2) NOT NULL DEFAULT 0,
  difference_amount numeric(12,2) NOT NULL DEFAULT 0,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_batches_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT reconciliation_batches_tenant_external_key UNIQUE (tenant_id, external_reference),
  CONSTRAINT reconciliation_batches_tenant_branch_fk FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT reconciliation_batches_tenant_acquirer_fk FOREIGN KEY (tenant_id, acquirer_id)
    REFERENCES payment_acquirers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT reconciliation_batches_status_check CHECK (status IN ('processing', 'reconciled', 'diverged', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS reconciliation_batches_tenant_branch_idx
  ON reconciliation_batches (tenant_id, branch_id, statement_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  external_reference varchar(180) NOT NULL,
  expected_amount numeric(12,2) NOT NULL,
  actual_amount numeric(12,2) NOT NULL,
  difference_amount numeric(12,2) NOT NULL,
  status varchar(24) NOT NULL,
  effective_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_items_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT reconciliation_items_tenant_external_key UNIQUE (tenant_id, batch_id, external_reference),
  CONSTRAINT reconciliation_items_tenant_branch_fk FOREIGN KEY (tenant_id, branch_id)
    REFERENCES branches (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT reconciliation_items_tenant_batch_fk FOREIGN KEY (tenant_id, batch_id)
    REFERENCES reconciliation_batches (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT reconciliation_items_tenant_payment_fk FOREIGN KEY (tenant_id, payment_id)
    REFERENCES sale_payments (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT reconciliation_items_difference_check CHECK (difference_amount = actual_amount - expected_amount),
  CONSTRAINT reconciliation_items_status_check CHECK (status IN ('reconciled', 'diverged'))
);

CREATE INDEX IF NOT EXISTS reconciliation_items_tenant_batch_idx
  ON reconciliation_items (tenant_id, batch_id, status);

CREATE OR REPLACE FUNCTION prevent_financial_snapshot_update() RETURNS trigger AS $$
BEGIN
  IF OLD.snapshot_locked_at IS NOT NULL AND (
    NEW.snapshot_locked_at IS DISTINCT FROM OLD.snapshot_locked_at OR
    NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
    NEW.net_amount IS DISTINCT FROM OLD.net_amount OR
    to_jsonb(NEW) ->> 'branch_id' IS DISTINCT FROM to_jsonb(OLD) ->> 'branch_id' OR
    to_jsonb(NEW) ->> 'acquirer_id' IS DISTINCT FROM to_jsonb(OLD) ->> 'acquirer_id' OR
    to_jsonb(NEW) ->> 'brand' IS DISTINCT FROM to_jsonb(OLD) ->> 'brand' OR
    to_jsonb(NEW) ->> 'installments' IS DISTINCT FROM to_jsonb(OLD) ->> 'installments' OR
    to_jsonb(NEW) ->> 'processing_fee_amount' IS DISTINCT FROM to_jsonb(OLD) ->> 'processing_fee_amount' OR
    to_jsonb(NEW) ->> 'anticipation_fee_amount' IS DISTINCT FROM to_jsonb(OLD) ->> 'anticipation_fee_amount' OR
    to_jsonb(NEW) ->> 'total_fee_amount' IS DISTINCT FROM to_jsonb(OLD) ->> 'total_fee_amount' OR
    to_jsonb(NEW) ->> 'fee_amount' IS DISTINCT FROM to_jsonb(OLD) ->> 'fee_amount' OR
    to_jsonb(NEW) ->> 'fee_rule_id' IS DISTINCT FROM to_jsonb(OLD) ->> 'fee_rule_id' OR
    to_jsonb(NEW) ->> 'fee_rule_version' IS DISTINCT FROM to_jsonb(OLD) ->> 'fee_rule_version' OR
    to_jsonb(NEW) ->> 'sale_payment_id' IS DISTINCT FROM to_jsonb(OLD) ->> 'sale_payment_id' OR
    to_jsonb(NEW) ->> 'expected_settlement_date' IS DISTINCT FROM to_jsonb(OLD) ->> 'expected_settlement_date'
  ) THEN
    RAISE EXCEPTION 'financial snapshot is immutable';
  END IF;
  IF OLD.snapshot_locked_at IS NULL AND NEW.gross_amount IS NOT NULL AND NEW.net_amount IS NOT NULL THEN
    NEW.snapshot_locked_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sale_payments_snapshot_immutable ON sale_payments;
CREATE TRIGGER sale_payments_snapshot_immutable BEFORE UPDATE ON sale_payments
FOR EACH ROW EXECUTE FUNCTION prevent_financial_snapshot_update();
DROP TRIGGER IF EXISTS accounts_receivable_snapshot_immutable ON accounts_receivable;
CREATE TRIGGER accounts_receivable_snapshot_immutable BEFORE UPDATE ON accounts_receivable
FOR EACH ROW EXECUTE FUNCTION prevent_financial_snapshot_update();

ALTER TABLE payment_acquirers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON payment_acquirers;
CREATE POLICY tenant_isolation ON payment_acquirers
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON payment_fee_rules;
CREATE POLICY tenant_isolation ON payment_fee_rules
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON payment_settlements;
CREATE POLICY tenant_isolation ON payment_settlements
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON reconciliation_batches;
CREATE POLICY tenant_isolation ON reconciliation_batches
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON reconciliation_items;
CREATE POLICY tenant_isolation ON reconciliation_items
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
