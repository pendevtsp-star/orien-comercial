ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp varchar(30),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS suppliers_branch_idx
  ON suppliers (tenant_id, branch_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS suppliers_active_idx
  ON suppliers (tenant_id, is_active)
  WHERE deleted_at IS NULL;
