CREATE TABLE IF NOT EXISTS platform_error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  error_code text NOT NULL,
  message text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_error_events_created_at_idx
  ON platform_error_events (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_error_events_request_id_idx
  ON platform_error_events (request_id);
