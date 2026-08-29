-- knowledge_chunks may exist without source_id if 005 ran before this column was added
-- (CREATE TABLE IF NOT EXISTS does not add new columns to existing tables).

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS source_id text;
