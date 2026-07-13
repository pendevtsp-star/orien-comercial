ALTER TABLE fiscal_documents
  ADD COLUMN IF NOT EXISTS environment varchar(40) NOT NULL DEFAULT 'homologation',
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS fiscal_documents_tenant_status_idx
  ON fiscal_documents(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS fiscal_documents_sale_idx
  ON fiscal_documents(tenant_id, sale_id);

ALTER TABLE sale_payments
  ADD COLUMN IF NOT EXISTS external_id varchar(160),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_document varchar(20);
