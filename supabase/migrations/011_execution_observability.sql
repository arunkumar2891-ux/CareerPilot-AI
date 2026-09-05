-- Execution observability: per-job and per-node execution records with attempt history.

-- Extend workflow_runs with job counters and workflow snapshot for historical viewing.
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS jobs_total int NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS jobs_successful int NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS jobs_failed int NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS jobs_skipped int NOT NULL DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS trigger_type text;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS workflow_snapshot jsonb;

-- Allow partially_failed overall run status.
ALTER TABLE public.workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_status_check;
ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_status_check
  CHECK (status IN (
    'idle', 'queued', 'running', 'success', 'failed', 'cancelled', 'paused', 'waiting', 'partially_failed'
  ));

CREATE TABLE IF NOT EXISTS workflow_job_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  job_index int NOT NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  label text,
  status text NOT NULL DEFAULT 'pending',
  attempt int NOT NULL DEFAULT 1,
  input_snapshot jsonb,
  failed_node_id uuid,
  checkpoint_data jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  error_type text,
  error_code text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (run_id, job_index, attempt)
);

CREATE INDEX IF NOT EXISTS idx_workflow_job_executions_run
  ON workflow_job_executions (run_id, job_index);

CREATE INDEX IF NOT EXISTS idx_workflow_job_executions_run_status
  ON workflow_job_executions (run_id, status);

CREATE TABLE IF NOT EXISTS workflow_node_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  job_execution_id uuid REFERENCES workflow_job_executions(id) ON DELETE CASCADE,
  workflow_node_id uuid NOT NULL,
  node_name text NOT NULL,
  node_type text NOT NULL,
  job_index int,
  attempt int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  error_type text,
  error_code text,
  error_message text,
  output_summary jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_run
  ON workflow_node_executions (run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_job
  ON workflow_node_executions (job_execution_id);

CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_node
  ON workflow_node_executions (run_id, workflow_node_id, job_index, attempt);

-- Structured log associations (additive; existing logs remain valid).
ALTER TABLE workflow_logs ADD COLUMN IF NOT EXISTS job_execution_id uuid REFERENCES workflow_job_executions(id) ON DELETE SET NULL;
ALTER TABLE workflow_logs ADD COLUMN IF NOT EXISTS node_execution_id uuid REFERENCES workflow_node_executions(id) ON DELETE SET NULL;
ALTER TABLE workflow_logs ADD COLUMN IF NOT EXISTS job_index int;
ALTER TABLE workflow_logs ADD COLUMN IF NOT EXISTS attempt int;
ALTER TABLE workflow_logs ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE workflow_job_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_node_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_job_executions_select_own ON workflow_job_executions;
CREATE POLICY workflow_job_executions_select_own ON workflow_job_executions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_job_executions_insert_own ON workflow_job_executions;
CREATE POLICY workflow_job_executions_insert_own ON workflow_job_executions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_job_executions_update_own ON workflow_job_executions;
CREATE POLICY workflow_job_executions_update_own ON workflow_job_executions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_job_executions_delete_own ON workflow_job_executions;
CREATE POLICY workflow_job_executions_delete_own ON workflow_job_executions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_node_executions_select_own ON workflow_node_executions;
CREATE POLICY workflow_node_executions_select_own ON workflow_node_executions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_node_executions_insert_own ON workflow_node_executions;
CREATE POLICY workflow_node_executions_insert_own ON workflow_node_executions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_node_executions_update_own ON workflow_node_executions;
CREATE POLICY workflow_node_executions_update_own ON workflow_node_executions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_node_executions_delete_own ON workflow_node_executions;
CREATE POLICY workflow_node_executions_delete_own ON workflow_node_executions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_job_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_node_executions TO authenticated;
