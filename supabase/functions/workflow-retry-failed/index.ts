import { createUserClient, createAdminClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { createRetryAttempts } from '../_shared/workflow/execution-persistence.ts';
import { executeWorkflow, loadWorkflow } from '../_shared/workflow/executor.ts';
import { isJobPipelineStart } from '../_shared/workflow/job-pipeline.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createUserClient(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const runId = body.runId as string;
    if (!runId) return jsonResponse({ error: 'runId required' }, 400);

    const { data: run, error: runError } = await supabase
      .from('workflow_runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', user.id)
      .single();
    if (runError || !run) return jsonResponse({ error: 'Run not found' }, 404);

    const admin = createAdminClient();
    const newAttempts = await createRetryAttempts(admin, runId, user.id);
    if (!newAttempts.length) {
      return jsonResponse({ error: 'No failed jobs to retry' }, 400);
    }

    const stored = (run.context as Record<string, unknown>) || {};
    const variables = (stored.variables as Record<string, unknown>) || {};
    variables.retryPendingJobs = true;
    variables.jobExecutionsInitialized = true;

    await supabase.from('workflow_runs').update({
      context: { ...stored, variables },
      status: 'running',
      finished_at: null,
      error_message: null,
    }).eq('id', runId);

    const { nodes } = await loadWorkflow(run.workflow_id as string, user.id);
    const pipelineStart = nodes.find((n) => isJobPipelineStart(n));
    if (!pipelineStart) return jsonResponse({ error: 'Pipeline start node not found' }, 400);

    const task = executeWorkflow(
      run.workflow_id as string,
      user.id,
      runId,
      pipelineStart.id,
    );

    const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(task);
      return jsonResponse({ runId, status: 'running', retriedJobs: newAttempts.length });
    }

    const result = await task;
    return jsonResponse({ runId: result.runId, status: result.status, retriedJobs: newAttempts.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
