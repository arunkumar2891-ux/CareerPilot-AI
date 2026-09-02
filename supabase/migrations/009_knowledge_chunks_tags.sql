-- Production knowledge_chunks may predate the tags column in 005.
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
