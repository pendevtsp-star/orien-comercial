ALTER TABLE purchase_fiscal_documents
  ADD COLUMN IF NOT EXISTS payment_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS uq_accounts_payable_fiscal_document;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_payable_fiscal_document_installment
  ON accounts_payable(tenant_id, source_document_id, installment_number)
  WHERE source_document_id IS NOT NULL;

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.16.0',
  'Parcelas da NF-e no contas a pagar',
  'O Orien passa a importar vencimentos e valores de duplicatas da NF-e para o financeiro.',
  ARRAY[
    'O XML de NF-e identifica parcelas, vencimentos e valores do grupo de cobrança quando disponível.',
    'O recebimento gera uma conta a pagar por parcela, vinculada à mesma NF-e e ao fornecedor.',
    'Notas sem cobrança explícita continuam gerando uma única conta a pagar para conferência manual.'
  ],
  ARRAY['owner','admin','manager','finance','accountant']
)
ON CONFLICT (version) DO NOTHING;
