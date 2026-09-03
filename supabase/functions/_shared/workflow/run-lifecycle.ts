import { createAdminClient } from '../supabase-admin.ts';

export class RunCancelledError extends Error {
  constructor() {
    super('Execution cancelled by user');
    this.name = 'RunCancelledError';
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

export async function isRunCancelled(admin: AdminClient, runId: string): Promise<boolean> {
  const { data } = await admin.from('workflow_runs').select('status').eq('id', runId).single();
  return data?.status === 'cancelled';
}

export async function assertRunActive(admin: AdminClient, runId: string): Promise<void> {
  if (await isRunCancelled(admin, runId)) throw new RunCancelledError();
}

const STALE_RUN_IDLE_MS = 8 * 60 * 1000;
const STALE_QUEUE_PROCESSING_MS = 5 * 60 * 1000;

/** Unstick runs killed by Edge Function wall-clock limits or queue rows left in `processing`. */
export async function recoverStaleWorkflowState(admin: AdminClient): Promise<{ runsFailed: number; queueReset: number }> {
  const now = Date.now();
  const runIdleCutoff = new Date(now - STALE_RUN_IDLE_MS).toISOString();
  const queueCutoff = new Date(now - STALE_QUEUE_PROCESSING_MS).toISOString();

  const { data: stuckQueue } = await admin
    .from('workflow_step_queue')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('created_at', queueCutoff)
    .select('id');
  const queueReset = stuckQueue?.length ?? 0;

  const { data: runs } = await admin
    .from('workflow_runs')
    .select('id, started_at')
    .in('status', ['running', 'queued']);
  if (!runs?.length) return { runsFailed: 0, queueReset };

  let runsFailed = 0;
  for (const run of runs) {
    const { data: lastLog } = await admin
      .from('workflow_logs')
      .select('timestamp')
      .eq('run_id', run.id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastActivity = (lastLog?.timestamp as string | undefined) || (run.started_at as string | undefined);
    if (!lastActivity || lastActivity > runIdleCutoff) continue;

    const { data: pendingStep } = await admin
      .from('workflow_step_queue')
      .select('id')
      .eq('run_id', run.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();
    if (pendingStep?.id) continue;

    const duration = run.started_at
      ? now - new Date(run.started_at as string).getTime()
      : 0;
    await admin.from('workflow_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_message:
        'Workflow stopped responding (likely Edge Function time limit). Use Stop, then re-run. Check Supabase → Edge Functions → Logs for workflow-run / workflow-step.',
      duration_ms: duration,
      current_node_id: null,
    }).eq('id', run.id).in('status', ['running', 'queued']);
    await admin.from('workflow_step_queue').delete().eq('run_id', run.id);
    runsFailed++;
  }

  return { runsFailed, queueReset };
}
