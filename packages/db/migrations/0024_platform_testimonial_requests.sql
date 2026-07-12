CREATE TABLE IF NOT EXISTS platform_testimonial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  token varchar(96) NOT NULL UNIQUE,
  recipient_email varchar(320),
  status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'revoked')),
  name varchar(120),
  company varchar(160),
  role varchar(120),
  quote text,
  image_url text,
  consent_publication boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_testimonial_requests_status_idx
  ON platform_testimonial_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_testimonial_requests_tenant_idx
  ON platform_testimonial_requests(tenant_id, created_at DESC);
