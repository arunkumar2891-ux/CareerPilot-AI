-- Allow users to stop their own running executions from the app.
-- Cancel writes status=cancelled; without UPDATE RLS the Edge Function
-- could succeed while a client-side fallback could not persist.

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_step_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_runs_update_own ON public.workflow_runs;
CREATE POLICY workflow_runs_update_own ON public.workflow_runs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_step_queue_delete_own ON public.workflow_step_queue;
CREATE POLICY workflow_step_queue_delete_own ON public.workflow_step_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT UPDATE ON public.workflow_runs TO authenticated;
GRANT DELETE ON public.workflow_step_queue TO authenticated;
