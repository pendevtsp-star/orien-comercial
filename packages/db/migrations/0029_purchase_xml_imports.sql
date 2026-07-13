ALTER TABLE purchase_entries
  ADD COLUMN IF NOT EXISTS document_key varchar(44),
  ADD COLUMN IF NOT EXISTS source_type varchar(32) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_entries_tenant_document_key_unique
  ON purchase_entries (tenant_id, document_key)
  WHERE document_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_entries_tenant_supplier_document_idx
  ON purchase_entries (tenant_id, supplier_id, document_number, created_at DESC);
