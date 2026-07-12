ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS recovery_code_hashes jsonb NOT NULL DEFAULT '[]';
