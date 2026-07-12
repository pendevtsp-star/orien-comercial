ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT true;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
