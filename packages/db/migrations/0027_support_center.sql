CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  opened_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_platform_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'app',
  page_url text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low','normal','high','critical')),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open','waiting_support','waiting_customer','resolved','closed')),
  CONSTRAINT support_tickets_category_check CHECK (category IN ('general','billing','technical','operation','integration','bug','suggestion'))
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  author_kind text NOT NULL DEFAULT 'tenant_user',
  body text NOT NULL,
  internal_note boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_messages_author_kind_check CHECK (author_kind IN ('tenant_user','platform_user','system'))
);

CREATE INDEX IF NOT EXISTS support_tickets_tenant_status_idx
  ON support_tickets (tenant_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS support_tickets_branch_idx
  ON support_tickets (tenant_id, branch_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx
  ON support_tickets (assigned_platform_user_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON support_ticket_messages (ticket_id, created_at ASC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON support_tickets;
CREATE POLICY tenant_isolation ON support_tickets
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON support_ticket_messages;
CREATE POLICY tenant_isolation ON support_ticket_messages
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
