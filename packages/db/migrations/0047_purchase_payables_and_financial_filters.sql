ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS source_type varchar(60),
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES purchase_fiscal_documents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_payable_fiscal_document
  ON accounts_payable(tenant_id, source_document_id)
  WHERE source_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_payable_operational_filters
  ON accounts_payable(tenant_id, branch_id, status, due_date, payment_method);

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.15.0',
  'Financeiro vinculado ao recebimento de NF-e',
  'O recebimento de compras por XML passa a gerar conta a pagar rastreável e o financeiro ganha filtros operacionais.',
  ARRAY[
    'Cada NF-e recebida gera uma única conta a pagar vinculada ao documento e ao fornecedor.',
    'Contas a pagar e receber podem ser filtradas por texto, período, loja e forma de pagamento.',
    'A origem fiscal do lançamento fica disponível para auditoria e conferência gerencial.'
  ],
  ARRAY['owner','admin','manager','finance','accountant']
)
ON CONFLICT (version) DO NOTHING;
