-- Workflow engine execution state
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS context jsonb DEFAULT '{}';
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS current_node_id uuid;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS error_message text;

-- Job PDF links
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resume_document_id uuid REFERENCES documents(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pdf_url text;

-- Resumable step queue for wait/poll nodes
CREATE TABLE IF NOT EXISTS workflow_step_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  node_id uuid NOT NULL,
  execute_after timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_queue_pending
  ON workflow_step_queue (status, execute_after)
  WHERE status = 'pending';

ALTER TABLE workflow_step_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_own_step_queue ON workflow_step_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY insert_own_step_queue ON workflow_step_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY update_own_step_queue ON workflow_step_queue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY delete_own_step_queue ON workflow_step_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Safe integrations access (no credentials exposed to client)
-- See migration 004 for security_invoker RPC + column-level grants

CREATE OR REPLACE FUNCTION get_integrations_safe()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  category text,
  status text,
  description text,
  icon text,
  last_sync timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    i.id, i.user_id, i.name, i.category, i.status, i.description, i.icon, i.last_sync, i.created_at, i.updated_at
  FROM integrations i
  WHERE i.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_integrations_safe() TO authenticated;

-- Settings helpers
CREATE OR REPLACE FUNCTION get_user_settings()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(data, '{}'::jsonb) FROM settings WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_user_settings() TO authenticated;

CREATE OR REPLACE FUNCTION upsert_user_settings(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  INSERT INTO settings (user_id, data)
  VALUES (auth.uid(), p_data)
  ON CONFLICT (user_id) DO UPDATE
    SET data = settings.data || EXCLUDED.data, updated_at = now()
  RETURNING data INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_user_settings(jsonb) TO authenticated;
