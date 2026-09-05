-- Distinguish seeded corpus/template resumes from job-tailored resumes
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS is_corpus boolean NOT NULL DEFAULT false;

UPDATE resumes
SET is_corpus = true
WHERE job_id IS NULL
  AND name NOT LIKE 'Tailored:%'
  AND (
    name = 'Master ATS (bullet bank)'
    OR name = '2-page template'
    OR name LIKE 'ATS Bank:%'
  );

CREATE INDEX IF NOT EXISTS idx_resumes_is_corpus ON resumes(user_id, is_corpus);
