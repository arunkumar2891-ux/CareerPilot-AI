-- Sequential per-role executions: one workflow run per search target, run linearly.
-- Replaces the in-executor role loop (which coupled all roles into a single run,
-- so one hung Apify poll stalled every later role).

CREATE TABLE IF NOT EXISTS workflow_run_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  -- Ordered SearchTarget[] — [{ role, location, remoteOnly, label }, ...]
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Index of the next target to spawn. cursor >= total means the batch is drained.
  cursor int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  trigger_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT workflow_run_batches_status_check
    CHECK (status IN ('running', 'completed', 'cancelled'))
);

-- Scheduler sweep: find batches still owing runs.
CREATE INDEX IF NOT EXISTS idx_workflow_run_batches_active
  ON workflow_run_batches (status, created_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_workflow_run_batches_user
  ON workflow_run_batches (user_id, created_at DESC);

-- Batches are written only by Edge Functions via the service role, matching
-- scheduled_run_slots. The UI reads batch state off the denormalized columns
-- on workflow_runs below, so no authenticated policy is required here.
ALTER TABLE workflow_run_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE workflow_run_batches FROM anon, authenticated;
GRANT ALL ON TABLE workflow_run_batches TO service_role;

-- Link runs to their batch. Nullable: pre-existing runs and the single-job
-- Resume Tailoring workflow are not batched.
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS batch_id uuid
  REFERENCES workflow_run_batches(id) ON DELETE SET NULL;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS batch_index int;
-- batch_total and search_label are denormalized so ExecutionsPage can render
-- "Integration Architect · 2/6" without joining a service-role-only table.
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS batch_total int;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS search_label text;

-- THE core idempotency guard. advanceRunBatch is driven by both the minute
-- scheduler and run finalization; without this a race could spawn the same
-- target twice. The duplicate insert is caught and treated as "already spawned".
CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_batch_index_unique
  ON workflow_runs (batch_id, batch_index)
  WHERE batch_id IS NOT NULL;

-- advanceRunBatch checks for an in-flight sibling before spawning the next target.
CREATE INDEX IF NOT EXISTS idx_workflow_runs_batch_status
  ON workflow_runs (batch_id, status)
  WHERE batch_id IS NOT NULL;
