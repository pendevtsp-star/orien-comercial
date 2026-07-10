ALTER TABLE alert_events
  ADD COLUMN IF NOT EXISTS fingerprint varchar(180),
  ADD COLUMN IF NOT EXISTS recipient varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS alert_events_tenant_fingerprint_idx
  ON alert_events (tenant_id, fingerprint)
  WHERE fingerprint IS NOT NULL;
