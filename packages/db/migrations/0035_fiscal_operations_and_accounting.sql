ALTER TABLE branch_fiscal_settings
  ADD COLUMN IF NOT EXISTS webhook_token_hash varchar(64),
  ADD COLUMN IF NOT EXISTS webhook_token_last4 varchar(4),
  ADD COLUMN IF NOT EXISTS webhook_configured_at timestamptz,
  ADD COLUMN IF NOT EXISTS homologation_status varchar(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS homologation_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS homologation_approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS production_revoked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE branch_fiscal_settings
  DROP CONSTRAINT IF EXISTS branch_fiscal_homologation_status_check;
ALTER TABLE branch_fiscal_settings
  ADD CONSTRAINT branch_fiscal_homologation_status_check
    CHECK (homologation_status IN ('pending', 'in_progress', 'passed', 'failed'));

CREATE TABLE IF NOT EXISTS fiscal_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_document_id uuid NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL,
  event_key varchar(128) NOT NULL,
  reference varchar(160) NOT NULL,
  event_type varchar(80),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_digest varchar(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'received',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key),
  CONSTRAINT fiscal_webhook_status_check
    CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored'))
);
CREATE INDEX IF NOT EXISTS fiscal_webhook_events_document_idx
  ON fiscal_webhook_events(tenant_id, fiscal_document_id, received_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_webhook_events_pending_idx
  ON fiscal_webhook_events(status, received_at)
  WHERE status IN ('received', 'failed');

CREATE TABLE IF NOT EXISTS fiscal_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_document_id uuid NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  kind varchar(24) NOT NULL,
  source_url text NOT NULL,
  storage_key text,
  content_type varchar(120),
  sha256 varchar(64),
  size_bytes bigint,
  status varchar(24) NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  downloaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_document_id, kind),
  CONSTRAINT fiscal_artifact_kind_check CHECK (kind IN ('xml', 'danfe', 'cancellation_xml')),
  CONSTRAINT fiscal_artifact_status_check
    CHECK (status IN ('pending', 'downloading', 'ready', 'failed'))
);
CREATE INDEX IF NOT EXISTS fiscal_artifacts_pending_idx
  ON fiscal_artifacts(status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS fiscal_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_document_id uuid NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
  kind varchar(40) NOT NULL,
  recipient varchar(255) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_document_id, kind, recipient),
  CONSTRAINT fiscal_alert_status_check CHECK (status IN ('pending', 'sent', 'failed'))
);
CREATE INDEX IF NOT EXISTS fiscal_alert_deliveries_pending_idx
  ON fiscal_alert_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'failed');

INSERT INTO permissions(slug, description) VALUES
  ('fiscal.activate', 'Autorizar ou revogar a emissão fiscal em produção')
ON CONFLICT (slug) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO roles(tenant_id, slug, name, is_system)
SELECT t.id, 'accountant', 'Contador', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.tenant_id=t.id AND r.slug='accountant' AND r.deleted_at IS NULL
);

WITH grants(role_slug, permission_slug) AS (
  VALUES
    ('owner', 'fiscal.activate'),
    ('admin', 'fiscal.activate'),
    ('accountant', 'fiscal.read'),
    ('accountant', 'fiscal.review'),
    ('accountant', 'products.read'),
    ('accountant', 'financial.read'),
    ('accountant', 'stock.reports'),
    ('accountant', 'dashboard.read')
)
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r ON r.slug=g.role_slug AND r.deleted_at IS NULL
JOIN permissions p ON p.slug=g.permission_slug
ON CONFLICT DO NOTHING;

ALTER TABLE fiscal_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_alert_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON fiscal_webhook_events;
CREATE POLICY tenant_isolation ON fiscal_webhook_events
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON fiscal_artifacts;
CREATE POLICY tenant_isolation ON fiscal_artifacts
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON fiscal_alert_deliveries;
CREATE POLICY tenant_isolation ON fiscal_alert_deliveries
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.3.0',
  'Operação fiscal acompanhada',
  'A Central Fiscal agora recebe retornos do provedor, protege XML e DANFE e organiza a aprovação para produção.',
  ARRAY[
    'Webhooks autenticados e idempotentes com processamento auditado.',
    'Download protegido de XML e DANFE e retentativas automáticas.',
    'Espaço do contador e dupla aprovação antes da emissão em produção.'
  ],
  ARRAY['owner','admin','manager','accountant']
)
ON CONFLICT (version) DO NOTHING;
