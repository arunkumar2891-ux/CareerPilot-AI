-- Distinguish master vs role-specific corpus resumes; allow DOCX/markdown uploads.
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS corpus_type TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS corpus_source TEXT;

UPDATE resumes
SET corpus_type = 'master'
WHERE is_corpus = true
  AND name = 'Master ATS (bullet bank)';

UPDATE resumes
SET corpus_type = 'role_specific'
WHERE is_corpus = true
  AND name LIKE 'ATS Bank:%';

CREATE INDEX IF NOT EXISTS idx_resumes_corpus_type ON resumes(user_id, corpus_type);

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'resumes';
