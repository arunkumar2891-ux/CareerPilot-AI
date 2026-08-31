import { createUserClient, createAdminClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { createRun, executeWorkflow } from '../_shared/workflow/executor.ts';

async function markRunFailed(runId: string, message: string) {
  const admin = createAdminClient();
  const { data: run } = await admin.from('workflow_runs').select('started_at, status').eq('id', runId).single();
  if (run?.status === 'cancelled') return;
  const duration = run?.started_at
    ? Date.now() - new Date(run.started_at as string).getTime()
    : 0;
  await admin.from('workflow_runs').update({
    status: 'failed',
    finished_at: new Date().toISOString(),
    error_message: message,
    duration_ms: duration,
  }).eq('id', runId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createUserClient(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const workflowId = body.workflowId as string;
    if (!workflowId) return jsonResponse({ error: 'workflowId required' }, 400);

    const run = await createRun(workflowId, user.id);
    const runId = run.id as string;

    const task = executeWorkflow(workflowId, user.id, runId).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      await markRunFailed(runId, message);
      throw err;
    });

    // Continue workflow in the background; HTTP returns immediately so the UI can poll status.
    const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(task);
      return jsonResponse({ runId, status: 'running' });
    }

    const result = await task;
    return jsonResponse({ runId: result.runId, status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
