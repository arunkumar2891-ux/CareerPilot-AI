-- Allow stop/resume statuses used by the app (cancelled was missing on some projects).
ALTER TABLE public.workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_status_check;

ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_status_check
  CHECK (status IN (
    'idle',
    'queued',
    'running',
    'success',
    'failed',
    'cancelled',
    'paused',
    'waiting'
  ));
