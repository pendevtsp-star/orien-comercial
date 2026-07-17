-- Completa o contrato operacional do financeiro para contas a receber.
-- A listagem usa as mesmas colunas para recebiveis e pagaveis, inclusive filtros e auditoria.
ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS source_type varchar(60),
  ADD COLUMN IF NOT EXISTS source_document_id uuid;

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_operational_filters
  ON accounts_receivable(tenant_id, branch_id, status, due_date, payment_method);

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_source_document
  ON accounts_receivable(tenant_id, source_type, source_document_id)
  WHERE source_document_id IS NOT NULL;
