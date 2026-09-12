-- Auto-apply: email extraction and application tracking columns

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_email text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_email_source text; -- 'extracted', 'manual'

ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_method text; -- 'email', 'manual'
ALTER TABLE applications ADD COLUMN IF NOT EXISTS email_message_id text; -- Gmail message ID
ALTER TABLE applications ADD COLUMN IF NOT EXISTS email_subject text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS email_body text;
