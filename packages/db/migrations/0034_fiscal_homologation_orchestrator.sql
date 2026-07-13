CREATE TABLE IF NOT EXISTS branch_fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL DEFAULT 'focus_nfe',
  environment varchar(24) NOT NULL DEFAULT 'homologation',
  status varchar(32) NOT NULL DEFAULT 'draft',
  document_mode varchar(16) NOT NULL DEFAULT 'nfce',
  tax_regime varchar(32) NOT NULL DEFAULT 'simples_nacional',
  legal_name varchar(180),
  trade_name varchar(180),
  tax_id varchar(20),
  state_registration varchar(32),
  municipal_registration varchar(32),
  state varchar(2),
  city_code varchar(7),
  address_line varchar(180),
  address_number varchar(24),
  district varchar(100),
  postal_code varchar(12),
  csc_identifier varchar(12),
  nfce_series integer NOT NULL DEFAULT 1,
  next_nfce_number integer NOT NULL DEFAULT 1,
  nfe_series integer NOT NULL DEFAULT 1,
  next_nfe_number integer NOT NULL DEFAULT 1,
  contingency_enabled boolean NOT NULL DEFAULT true,
  certificate_mode varchar(32) NOT NULL DEFAULT 'provider_managed',
  certificate_expires_at timestamptz,
  accountant_review_status varchar(24) NOT NULL DEFAULT 'pending',
  accountant_review_note text,
  accountant_reviewed_at timestamptz,
  accountant_reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id),
  CONSTRAINT branch_fiscal_provider_check CHECK (provider IN ('focus_nfe', 'spedy')),
  CONSTRAINT branch_fiscal_environment_check CHECK (environment IN ('homologation', 'production')),
  CONSTRAINT branch_fiscal_status_check CHECK (status IN ('draft', 'configured', 'blocked', 'active')),
  CONSTRAINT branch_fiscal_document_mode_check CHECK (document_mode IN ('nfce', 'nfe', 'both')),
  CONSTRAINT branch_fiscal_review_check CHECK (accountant_review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT branch_fiscal_tax_id_check CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{11,14}$'),
  CONSTRAINT branch_fiscal_city_code_check CHECK (city_code IS NULL OR city_code ~ '^[0-9]{7}$'),
  CONSTRAINT branch_fiscal_number_check CHECK (nfce_series > 0 AND nfe_series > 0 AND next_nfce_number > 0 AND next_nfe_number > 0)
);

ALTER TABLE fiscal_documents
  ADD COLUMN IF NOT EXISTS reference varchar(160),
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(160),
  ADD COLUMN IF NOT EXISTS access_key varchar(64),
  ADD COLUMN IF NOT EXISTS protocol varchar(80),
  ADD COLUMN IF NOT EXISTS rejection_code varchar(40),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS contingency_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_documents_reference_idx
  ON fiscal_documents(tenant_id, provider, reference)
  WHERE reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_documents_idempotency_idx
  ON fiscal_documents(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_documents_retry_idx
  ON fiscal_documents(tenant_id, status, next_retry_at)
  WHERE status IN ('retry_pending', 'rejected', 'error');

CREATE TABLE IF NOT EXISTS fiscal_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_document_id uuid NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(80) NOT NULL,
  status_from varchar(40),
  status_to varchar(40),
  provider_code varchar(40),
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_document_events_document_idx
  ON fiscal_document_events(tenant_id, fiscal_document_id, created_at DESC);

ALTER TABLE product_fiscal_profiles
  ADD COLUMN IF NOT EXISTS accountant_review_status varchar(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS accountant_review_note text,
  ADD COLUMN IF NOT EXISTS accountant_reviewed_at timestamptz,
  ADD CONSTRAINT product_fiscal_review_status_check
    CHECK (accountant_review_status IN ('pending', 'approved', 'rejected'));

UPDATE product_fiscal_profiles
SET accountant_review_status = 'approved',
    accountant_reviewed_at = COALESCE(accountant_reviewed_at, accountant_approved_at)
WHERE accountant_approved_at IS NOT NULL;

INSERT INTO permissions(slug, description) VALUES
  ('fiscal.read', 'Visualizar configuração e documentos fiscais'),
  ('fiscal.configure', 'Configurar emissão fiscal por loja'),
  ('fiscal.issue', 'Emitir e consultar documentos fiscais'),
  ('fiscal.cancel', 'Cancelar documentos fiscais'),
  ('fiscal.review', 'Revisar cadastros fiscais')
ON CONFLICT (slug) DO UPDATE SET description=EXCLUDED.description;

WITH grants(role_slug, permission_slug) AS (
  VALUES
    ('owner', 'fiscal.read'), ('owner', 'fiscal.configure'), ('owner', 'fiscal.issue'), ('owner', 'fiscal.cancel'), ('owner', 'fiscal.review'),
    ('admin', 'fiscal.read'), ('admin', 'fiscal.configure'), ('admin', 'fiscal.issue'), ('admin', 'fiscal.cancel'), ('admin', 'fiscal.review'),
    ('manager', 'fiscal.read'), ('manager', 'fiscal.issue'), ('manager', 'fiscal.cancel'), ('manager', 'fiscal.review'),
    ('seller', 'fiscal.read'), ('seller', 'fiscal.issue'),
    ('cashier', 'fiscal.read'), ('cashier', 'fiscal.issue'),
    ('stock', 'fiscal.read'),
    ('finance', 'fiscal.read')
)
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r ON r.slug=g.role_slug AND r.deleted_at IS NULL
JOIN permissions p ON p.slug=g.permission_slug
ON CONFLICT DO NOTHING;

ALTER TABLE branch_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_document_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON branch_fiscal_settings;
CREATE POLICY tenant_isolation ON branch_fiscal_settings
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON fiscal_document_events;
CREATE POLICY tenant_isolation ON fiscal_document_events
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.2.0',
  'Homologação fiscal por loja',
  'A Orien ganhou uma central fiscal segura para preparar, revisar e acompanhar NFC-e antes da ativação em produção.',
  ARRAY[
    'Configuração fiscal e aprovação contábil separadas por loja.',
    'Emissão, consulta, cancelamento e contingência em ambiente de homologação.',
    'Fila de rejeições com histórico operacional e tentativas auditadas.'
  ],
  ARRAY['owner','admin','manager','cashier','seller']
)
ON CONFLICT (version) DO NOTHING;
