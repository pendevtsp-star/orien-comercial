CREATE TABLE IF NOT EXISTS platform_landing_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value jsonb NOT NULL,
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  restored_from_id uuid REFERENCES platform_landing_revisions(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS platform_landing_revisions_published_idx
  ON platform_landing_revisions (published_at DESC);
