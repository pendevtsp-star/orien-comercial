ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_lifetime boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_complimentary boolean NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS lifetime_granted_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS lifetime_note text;

CREATE INDEX IF NOT EXISTS subscriptions_lifetime_idx ON subscriptions(is_lifetime) WHERE is_lifetime = true;
