ALTER TABLE accountant_portal_accesses
  ADD COLUMN IF NOT EXISTS allowed_period_start date,
  ADD COLUMN IF NOT EXISTS allowed_period_end date,
  ADD COLUMN IF NOT EXISTS login_code_hash varchar(128),
  ADD COLUMN IF NOT EXISTS login_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_code_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_token_hash varchar(128),
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accountant_portal_accesses_session_token
  ON accountant_portal_accesses(session_token_hash)
  WHERE session_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS accountant_portal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  access_id uuid NOT NULL REFERENCES accountant_portal_accesses(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL,
  period varchar(7),
  export_format varchar(12),
  ip_address varchar(80),
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accountant_portal_event_type_check
    CHECK (event_type IN ('code_requested','code_verified','login_failed','overview_viewed','export_downloaded','access_revoked'))
);

CREATE INDEX IF NOT EXISTS idx_accountant_portal_events_access
  ON accountant_portal_events(access_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accountant_portal_events_tenant
  ON accountant_portal_events(tenant_id, created_at DESC);

ALTER TABLE accountant_portal_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='accountant_portal_events' AND policyname='tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON accountant_portal_events
      USING (tenant_id = app_tenant_id())
      WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.14.0',
  'Portal do contador com login e trilha auditada',
  'O acesso externo do contador passa a usar confirmação por e-mail, competência liberada, exportação em CSV/PDF/XML e histórico de uso.',
  ARRAY[
    'Portal externo do contador agora solicita código de acesso enviado por e-mail antes de abrir os dados.',
    'O lojista pode limitar o acesso por competência inicial/final e acompanhar cada entrada ou download realizado.',
    'Exportações externas passam a oferecer CSV, PDF resumido e pacote XML dos documentos disponíveis.',
    'Cada consulta e exportação do contador fica auditada com data, competência, formato, IP e navegador.'
  ],
  ARRAY['owner','admin','manager','accountant']
)
ON CONFLICT (version) DO NOTHING;
