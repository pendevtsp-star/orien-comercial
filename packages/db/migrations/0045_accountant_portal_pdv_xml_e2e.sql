CREATE TABLE IF NOT EXISTS accountant_portal_accesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  email varchar(180) NOT NULL,
  token_hash varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accountant_portal_accesses_tenant
  ON accountant_portal_accesses(tenant_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_accountant_portal_accesses_email
  ON accountant_portal_accesses(tenant_id, email);

ALTER TABLE accountant_portal_accesses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='accountant_portal_accesses' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON accountant_portal_accesses
      USING (tenant_id = app_tenant_id())
      WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;

ALTER TABLE purchase_fiscal_document_items
  ADD COLUMN IF NOT EXISTS suggested_sale_price numeric(14,2);

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.13.0',
  'Contador externo, PDV focado e XML mais seguro',
  'O Orien passa a ter portal externo para contador, PDV mais direto para operação contínua, conferência XML persistente e rotina E2E recorrente.',
  ARRAY[
    'Espaço do contador agora gera acesso externo por link seguro, com competência, documentos, financeiro e estoque baixo sem usar login do lojista.',
    'PDV modo produção ganhou tela mais focada e retorno imediato para comprovante ou nova venda após concluir.',
    'Recebimento por XML/NF-e passa a persistir o preço de venda sugerido editado na conferência de itens.',
    'Fluxos críticos entram em rotina E2E recorrente para PDV, caixa, NF-e, permissões, documentos e relatórios.'
  ],
  ARRAY['owner','admin','manager','cashier','stock','finance','accountant']
)
ON CONFLICT (version) DO NOTHING;
