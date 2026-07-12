CREATE TABLE IF NOT EXISTS trial_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type varchar(40) NOT NULL CHECK (event_type IN ('welcome', 'ending_soon', 'expired')),
  recipient varchar(320) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  failure_reason text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, event_type)
);

CREATE INDEX IF NOT EXISTS trial_lifecycle_events_pending_idx
  ON trial_lifecycle_events(status, created_at)
  WHERE status IN ('pending', 'failed');
