-- Backfill resumes.job_id from tailored resume names and jobs table
UPDATE resumes r
SET job_id = j.id,
    updated_at = now()
FROM jobs j
WHERE r.user_id = j.user_id
  AND r.job_id IS NULL
  AND r.name = ('Tailored: ' || j.company || ' ' || j.role)
  AND NOT EXISTS (
    SELECT 1 FROM resumes r2
    WHERE r2.job_id = j.id AND r2.id <> r.id
  );
