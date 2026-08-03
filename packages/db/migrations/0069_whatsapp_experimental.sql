CREATE TABLE IF NOT EXISTS whatsapp_experimental_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'consent_required'
    CHECK (status IN ('consent_required', 'connecting', 'qr_ready', 'connected', 'disconnected', 'failed')),
  consented_at timestamptz,
  encrypted_state text,
  phone_number varchar(30),
  last_error varchar(500),
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_experimental_sessions_tenant_idx
  ON whatsapp_experimental_sessions (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_experimental_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES whatsapp_experimental_sessions(id) ON DELETE CASCADE,
  message_id varchar(180) NOT NULL,
  idempotency_key varchar(180) NOT NULL,
  direction varchar(16) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  remote_jid varchar(180) NOT NULL,
  remote_phone varchar(30) NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 4000),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, message_id),
  UNIQUE (session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS whatsapp_experimental_messages_rate_idx
  ON whatsapp_experimental_messages (session_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_experimental_messages_phone_idx
  ON whatsapp_experimental_messages (tenant_id, remote_phone, created_at DESC);

ALTER TABLE whatsapp_experimental_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_experimental_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON whatsapp_experimental_sessions
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
CREATE POLICY tenant_isolation ON whatsapp_experimental_messages
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
