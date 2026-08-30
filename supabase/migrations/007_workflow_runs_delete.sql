-- Let signed-in users delete their own workflow execution history from the app.

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_runs_delete_own ON public.workflow_runs;
CREATE POLICY workflow_runs_delete_own ON public.workflow_runs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_run_nodes_delete_own ON public.workflow_run_nodes;
CREATE POLICY workflow_run_nodes_delete_own ON public.workflow_run_nodes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS workflow_logs_delete_own ON public.workflow_logs;
CREATE POLICY workflow_logs_delete_own ON public.workflow_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT DELETE ON public.workflow_runs TO authenticated;
GRANT DELETE ON public.workflow_run_nodes TO authenticated;
GRANT DELETE ON public.workflow_logs TO authenticated;
