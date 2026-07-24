ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS quote_items_tenant_quote_created_idx
  ON quote_items (tenant_id, quote_id, created_at, id);
