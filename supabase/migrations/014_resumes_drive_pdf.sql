-- Resume storage: link to jobs, PDF paths, and Google Drive sync state
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS drive_file_id text;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS drive_synced_at timestamptz;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS pdf_url text;

CREATE INDEX IF NOT EXISTS idx_resumes_job_id ON resumes(job_id);
CREATE INDEX IF NOT EXISTS idx_resumes_drive_file_id ON resumes(drive_file_id) WHERE drive_file_id IS NOT NULL;
