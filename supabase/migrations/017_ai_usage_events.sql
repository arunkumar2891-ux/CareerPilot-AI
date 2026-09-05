CREATE TABLE IF NOT EXISTS ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gemini', 'groq')),
  operation text NOT NULL DEFAULT 'chat',
  tokens_input integer NOT NULL DEFAULT 0,
  tokens_output integer NOT NULL DEFAULT 0,
  tokens_total integer NOT NULL DEFAULT 0,
  credits_charged integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_month ON ai_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider ON ai_usage_events(user_id, provider, created_at DESC);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_events_select_own ON ai_usage_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY ai_usage_events_insert_own ON ai_usage_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
