ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS preview_data jsonb NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS import_jobs_tenant_created_idx
  ON import_jobs (tenant_id, created_at DESC);
