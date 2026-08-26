-- Career corpus for resume tailoring (resume-safe evidence chunks)

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  collection text NOT NULL DEFAULT 'career',
  source_id text,
  tags text[] NOT NULL DEFAULT '{}',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user_collection
  ON public.knowledge_chunks (user_id, collection);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_chunks_select_own ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_select_own ON public.knowledge_chunks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS knowledge_chunks_insert_own ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_insert_own ON public.knowledge_chunks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS knowledge_chunks_update_own ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_update_own ON public.knowledge_chunks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS knowledge_chunks_delete_own ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_delete_own ON public.knowledge_chunks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;
