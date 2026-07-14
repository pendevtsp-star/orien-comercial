CREATE TABLE IF NOT EXISTS purchase_fiscal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  purchase_entry_id uuid REFERENCES purchase_entries(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  access_key varchar(44) NOT NULL,
  document_number varchar(80) NOT NULL,
  series varchar(20),
  source varchar(24) NOT NULL DEFAULT 'xml_upload',
  status varchar(24) NOT NULL DEFAULT 'ready',
  issuer_name varchar(180) NOT NULL,
  issuer_document varchar(20),
  issued_at timestamptz,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  manifestation_status varchar(24) NOT NULL DEFAULT 'pending',
  manifestation_protocol varchar(120),
  manifested_at timestamptz,
  provider_version bigint,
  xml_content text,
  xml_sha256 varchar(64),
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  received_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, access_key),
  CONSTRAINT purchase_fiscal_source_check CHECK (source IN ('xml_upload', 'focus_key')),
  CONSTRAINT purchase_fiscal_status_check CHECK (status IN ('ready', 'review_pending', 'received', 'rejected', 'cancelled')),
  CONSTRAINT purchase_fiscal_manifestation_check CHECK (
    manifestation_status IN ('pending', 'ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_fiscal_documents_entry_unique
  ON purchase_fiscal_documents(purchase_entry_id) WHERE purchase_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_fiscal_documents_tenant_period_idx
  ON purchase_fiscal_documents(tenant_id, issued_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_fiscal_documents_branch_status_idx
  ON purchase_fiscal_documents(tenant_id, branch_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_fiscal_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_document_id uuid NOT NULL REFERENCES purchase_fiscal_documents(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  supplier_code varchar(80),
  barcode varchar(64),
  description varchar(240) NOT NULL,
  unit varchar(16),
  quantity numeric(14,4) NOT NULL,
  unit_cost numeric(14,4) NOT NULL,
  total_amount numeric(14,2) NOT NULL,
  ncm varchar(8),
  cest varchar(7),
  cfop varchar(4),
  tax_code varchar(12),
  matched_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  match_type varchar(24),
  resolution varchar(24) NOT NULL DEFAULT 'pending',
  divergences jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_document_id, line_number),
  CONSTRAINT purchase_fiscal_item_resolution_check CHECK (resolution IN ('pending', 'linked', 'created', 'ignored'))
);
CREATE INDEX IF NOT EXISTS purchase_fiscal_items_document_idx
  ON purchase_fiscal_document_items(tenant_id, fiscal_document_id, line_number);

CREATE TABLE IF NOT EXISTS purchase_fiscal_manifestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_document_id uuid NOT NULL REFERENCES purchase_fiscal_documents(id) ON DELETE CASCADE,
  manifestation_type varchar(24) NOT NULL,
  justification varchar(255),
  provider varchar(40) NOT NULL DEFAULT 'focus_nfe',
  status varchar(24) NOT NULL DEFAULT 'processed',
  protocol varchar(120),
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_fiscal_manifest_type_check CHECK (
    manifestation_type IN ('ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada')
  ),
  CONSTRAINT purchase_fiscal_manifest_status_check CHECK (status IN ('processed', 'failed'))
);
CREATE INDEX IF NOT EXISTS purchase_fiscal_manifestations_document_idx
  ON purchase_fiscal_manifestations(tenant_id, fiscal_document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS accounting_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  period date NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'draft',
  document_count integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  generated_at timestamptz,
  generated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id, period),
  CONSTRAINT accounting_closure_status_check CHECK (status IN ('draft', 'exported', 'closed')),
  CONSTRAINT accounting_closure_period_check CHECK (period = date_trunc('month', period)::date)
);
CREATE INDEX IF NOT EXISTS accounting_closures_tenant_period_idx
  ON accounting_closures(tenant_id, period DESC, branch_id);

ALTER TABLE purchase_fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_fiscal_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_fiscal_manifestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON purchase_fiscal_documents;
CREATE POLICY tenant_isolation ON purchase_fiscal_documents
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON purchase_fiscal_document_items;
CREATE POLICY tenant_isolation ON purchase_fiscal_document_items
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON purchase_fiscal_manifestations;
CREATE POLICY tenant_isolation ON purchase_fiscal_manifestations
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON accounting_closures;
CREATE POLICY tenant_isolation ON accounting_closures
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.4.0',
  'Recebimento fiscal e fechamento contábil',
  'Notas de compra passam por conferência fiscal, manifestação e organização mensal antes de atualizar o estoque.',
  ARRAY[
    'Importação de NF-e por XML ou chave, com divergências e vínculo a pedidos de compra.',
    'Manifestação do destinatário integrada à Focus NFe e registrada em auditoria.',
    'Pacote mensal do contador com documentos recebidos e resumo de saídas.'
  ],
  ARRAY['owner','admin','manager','stock','accountant']
)
ON CONFLICT (version) DO NOTHING;
