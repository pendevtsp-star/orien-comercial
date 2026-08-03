ALTER TABLE fiscal_document_events
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(180);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_document_events_tenant_idempotency_key
  ON fiscal_document_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
