-- Persist ATS review on resumes and link Copilot conversations to a resume
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ats_review jsonb;

ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_resume_id
  ON chat_conversations(resume_id)
  WHERE resume_id IS NOT NULL;
