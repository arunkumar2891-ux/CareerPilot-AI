-- Executions list/detail were timing out (Postgres 57014) after multi-job
-- resume tailoring. PostgREST nested embeds scanned workflow_logs and
-- workflow_run_nodes without run_id indexes, and list selected huge jsonb
-- (context, snapshots, node output, log metadata).

CREATE INDEX IF NOT EXISTS idx_workflow_logs_run_id
  ON public.workflow_logs (run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_logs_run_timestamp
  ON public.workflow_logs (run_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_logs_user_run
  ON public.workflow_logs (user_id, run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_run_nodes_run_id
  ON public.workflow_run_nodes (run_id);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_created
  ON public.workflow_runs (user_id, created_at DESC);
