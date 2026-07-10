ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_persistent boolean NOT NULL DEFAULT false;
