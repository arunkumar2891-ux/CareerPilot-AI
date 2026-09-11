-- Look up every log (and a compact run dump) for one workflow run.
-- In the Supabase SQL editor:
--   SELECT * FROM get_run_logs('11111111-1111-1111-1111-111111111111');
--   SELECT get_run_observability('11111111-1111-1111-1111-111111111111');

DROP POLICY IF EXISTS workflow_logs_select_own ON public.workflow_logs;
CREATE POLICY workflow_logs_select_own ON public.workflow_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON public.workflow_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.get_run_logs(p_run_id uuid)
RETURNS SETOF public.workflow_logs
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.workflow_logs
  WHERE run_id = p_run_id
  ORDER BY timestamp ASC, id ASC
  LIMIT 10000;
$$;

CREATE OR REPLACE FUNCTION public.get_run_observability(p_run_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'run', (
      SELECT jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'workflow_id', r.workflow_id,
        'started_at', r.started_at,
        'finished_at', r.finished_at,
        'error_message', r.error_message,
        'trigger_type', r.trigger_type,
        'jobs_total', r.jobs_total,
        'jobs_successful', r.jobs_successful,
        'jobs_failed', r.jobs_failed,
        'jobs_skipped', r.jobs_skipped,
        'current_node_id', r.current_node_id
      )
      FROM public.workflow_runs r
      WHERE r.id = p_run_id
    ),
    'logs', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.timestamp, l.id)
      FROM (
        SELECT *
        FROM public.workflow_logs
        WHERE run_id = p_run_id
        ORDER BY timestamp ASC, id ASC
        LIMIT 10000
      ) l
    ), '[]'::jsonb),
    'job_executions', COALESCE((
      SELECT jsonb_agg(to_jsonb(j) ORDER BY j.job_index, j.attempt)
      FROM public.workflow_job_executions j
      WHERE j.run_id = p_run_id
    ), '[]'::jsonb),
    'node_executions', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY n.started_at, n.id)
      FROM public.workflow_node_executions n
      WHERE n.run_id = p_run_id
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_run_logs(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_run_observability(uuid) TO authenticated, service_role;
