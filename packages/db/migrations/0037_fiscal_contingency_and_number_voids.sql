CREATE TABLE IF NOT EXISTS fiscal_number_voids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL DEFAULT 'focus_nfe',
  environment varchar(24) NOT NULL DEFAULT 'homologation',
  document_type varchar(12) NOT NULL DEFAULT 'nfce',
  series integer NOT NULL,
  number_start integer NOT NULL,
  number_end integer NOT NULL,
  justification varchar(255) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'requested',
  protocol varchar(120),
  provider_code varchar(60),
  provider_message text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_number_void_document_type_check CHECK (document_type IN ('nfce')),
  CONSTRAINT fiscal_number_void_environment_check CHECK (environment IN ('homologation', 'production')),
  CONSTRAINT fiscal_number_void_status_check CHECK (status IN ('requested', 'processed', 'failed')),
  CONSTRAINT fiscal_number_void_range_check CHECK (series > 0 AND number_start > 0 AND number_end >= number_start)
);

CREATE INDEX IF NOT EXISTS fiscal_number_voids_branch_idx
  ON fiscal_number_voids(tenant_id, branch_id, requested_at DESC);

ALTER TABLE fiscal_documents
  ADD COLUMN IF NOT EXISTS contingency_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS contingency_deadline_at timestamptz;

ALTER TABLE fiscal_number_voids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fiscal_number_voids;
CREATE POLICY tenant_isolation ON fiscal_number_voids
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.5.0',
  'Emissão fiscal mais operacional',
  'A Central Fiscal passa a orientar a emissão antes da transmissão, acompanhar contingência e registrar inutilização de numeração.',
  ARRAY[
    'Pré-validação fiscal por venda antes de solicitar NFC-e.',
    'Painel de documentos em contingência para acompanhar sincronização posterior.',
    'Registro auditado de inutilização de faixa de NFC-e por loja.'
  ],
  ARRAY['owner','admin','manager','cashier','accountant']
)
ON CONFLICT (version) DO NOTHING;
