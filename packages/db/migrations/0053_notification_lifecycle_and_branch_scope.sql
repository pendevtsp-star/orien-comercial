ALTER TABLE release_notes
  ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE release_notes
  DROP CONSTRAINT IF EXISTS release_notes_priority_check;

ALTER TABLE release_notes
  ADD CONSTRAINT release_notes_priority_check
  CHECK (priority IN ('low', 'normal', 'important', 'critical'));

UPDATE release_notes
SET expires_at = published_at + interval '45 days'
WHERE expires_at IS NULL
  AND is_pinned = false
  AND priority IN ('low', 'normal');

CREATE INDEX IF NOT EXISTS release_notes_visibility_idx
  ON release_notes (published_at DESC, expires_at)
  WHERE is_pinned = false;
