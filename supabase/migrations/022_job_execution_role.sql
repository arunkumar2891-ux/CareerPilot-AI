-- Per-role child pipelines: label job/node executions and persist on-demand score source.

ALTER TABLE workflow_job_executions ADD COLUMN IF NOT EXISTS search_role text;
ALTER TABLE workflow_node_executions ADD COLUMN IF NOT EXISTS search_role text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS match_score_source text;

CREATE INDEX IF NOT EXISTS idx_workflow_job_executions_run_role
  ON workflow_job_executions (run_id, search_role);
