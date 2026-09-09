import { createUserClient, createAdminClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { getUserSettings } from '../_shared/credentials.ts';
import { createRun, executeWorkflow, loadWorkflow } from '../_shared/workflow/executor.ts';
import { buildMultiJobDiscoveryRunSeed, workflowHasLoadJobNode } from '../_shared/workflow/job-discovery.ts';

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
  }).eq('id', runId).in('status', ['running', 'queued']);
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

    const jobId = String(body.jobId || '').trim();
    const rawJobIds = Array.isArray(body.jobIds) ? body.jobIds : [];
    const jobIds = [...new Set([
      ...rawJobIds.map((id: unknown) => String(id || '').trim()).filter(Boolean),
      ...(jobId ? [jobId] : []),
    ])];
    const { nodes } = await loadWorkflow(workflowId, user.id);
    const requiresJob = workflowHasLoadJobNode(nodes);
    if (requiresJob && jobIds.length === 0) {
      return jsonResponse({ error: 'Resume Tailoring requires at least one job. Start it from Job Discovery.' }, 400);
    }

    let triggerType = 'manual';
    let runContext: Record<string, unknown> | undefined;
    if (jobIds.length > 0 && requiresJob) {
      const settings = await getUserSettings(user.id);
      const resumeFileId = String(
        (settings.jobSearch as Record<string, unknown> | undefined)?.resumeFileId ?? '',
      ).trim();
      if (!resumeFileId) {
        return jsonResponse({ error: 'Add a Google Doc Resume ID in Settings before generating a tailored resume.' }, 400);
      }

      const admin = createAdminClient();
      const { data: jobs, error: jobError } = await admin
        .from('jobs')
        .select('*')
        .eq('user_id', user.id)
        .in('id', jobIds);
      if (jobError) throw jobError;
      if (!jobs?.length) return jsonResponse({ error: 'Job not found' }, 404);
      if (jobs.length !== jobIds.length) {
        return jsonResponse({ error: 'One or more selected jobs were not found' }, 404);
      }

      const byId = new Map(jobs.map((row) => [String(row.id), row as Record<string, unknown>]));
      const orderedJobs = jobIds.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
      const seed = buildMultiJobDiscoveryRunSeed(orderedJobs);
      triggerType = seed.triggerType;
      runContext = seed.context;
    }

    const run = await createRun(workflowId, user.id, {
      triggerType,
      triggeredBy: user.id,
      context: runContext,
    });
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
