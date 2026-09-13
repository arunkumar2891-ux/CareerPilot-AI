import type { createAdminClient } from '../supabase-admin.ts';
import { isDuplicateConstraintError } from '../job-dedupe.ts';
import { getEntryNodes } from './graph.ts';
import type { SearchTarget } from '../job-search-roles.ts';
import type { WorkflowEdgeRow, WorkflowNodeRow } from './types.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Runs that still own the batch's single execution slot. */
const ACTIVE_RUN_STATUSES = ['running', 'queued'];

export interface RunBatchRow {
  id: string;
  user_id: string;
  workflow_id: string;
  targets: SearchTarget[];
  cursor: number;
  total: number;
  status: string;
  trigger_type: string | null;
}

/**
 * Per-target run context. `createRun` writes this object verbatim into
 * `workflow_runs.context`, while `saveRunContext` and the resume reader both
 * expect `{ variables, nodeOutputs }` — so the target must be nested under
 * `variables` or it is silently dropped on the first context save.
 */
export function buildTargetRunContext(
  target: SearchTarget,
  batchIndex: number,
): Record<string, unknown> {
  return {
    variables: {
      currentRole: target.role,
      currentLocation: target.location,
      remoteOnly: target.remoteOnly,
      currentSearchLabel: target.label,
      batchIndex,
    },
    nodeOutputs: {},
  };
}

export async function createRunBatch(
  admin: AdminClient,
  input: {
    userId: string;
    workflowId: string;
    targets: SearchTarget[];
    triggerType?: string;
  },
): Promise<RunBatchRow | null> {
  if (!input.targets.length) return null;
  const { data, error } = await admin.from('workflow_run_batches').insert({
    user_id: input.userId,
    workflow_id: input.workflowId,
    targets: input.targets,
    cursor: 0,
    total: input.targets.length,
    status: 'running',
    trigger_type: input.triggerType ?? null,
  }).select().single();
  if (error) throw error;
  return data as unknown as RunBatchRow;
}

async function loadBatch(admin: AdminClient, batchId: string): Promise<RunBatchRow | null> {
  const { data } = await admin
    .from('workflow_run_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();
  return (data as unknown as RunBatchRow) ?? null;
}

/** Any run of this batch still holding the execution slot keeps the batch linear. */
async function hasActiveRun(admin: AdminClient, batchId: string): Promise<boolean> {
  const { data } = await admin
    .from('workflow_runs')
    .select('id')
    .eq('batch_id', batchId)
    .in('status', ACTIVE_RUN_STATUSES)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Next target index. Takes the max of two monotonic sources:
 *  - `cursor`, which only ever moves forward
 *  - `max(batch_index) + 1` over spawned runs
 *
 * Neither alone is safe: a user can delete individual runs (migration 007), so
 * `max + 1` could hand back an index that already ran, while `cursor` alone
 * would lose its place if a writer crashed between the insert and the update.
 */
async function nextBatchIndex(
  admin: AdminClient,
  batchId: string,
  cursor: number,
): Promise<number> {
  const { data } = await admin
    .from('workflow_runs')
    .select('batch_index')
    .eq('batch_id', batchId)
    .order('batch_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const safeCursor = Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 0;
  const highest = data?.batch_index;
  if (highest === null || highest === undefined) return safeCursor;
  const n = Number(highest);
  return Number.isFinite(n) ? Math.max(safeCursor, Math.floor(n) + 1) : safeCursor;
}

async function finishBatch(admin: AdminClient, batchId: string, status: string): Promise<void> {
  await admin.from('workflow_run_batches').update({
    status,
    finished_at: new Date().toISOString(),
  }).eq('id', batchId).eq('status', 'running');
}

async function loadWorkflowGraph(
  admin: AdminClient,
  workflowId: string,
): Promise<{ nodes: WorkflowNodeRow[]; edges: WorkflowEdgeRow[] }> {
  const { data } = await admin
    .from('workflows')
    .select('id, workflow_nodes(*), workflow_edges(*)')
    .eq('id', workflowId)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    nodes: (row.workflow_nodes as WorkflowNodeRow[]) || [],
    edges: (row.workflow_edges as WorkflowEdgeRow[]) || [],
  };
}

/**
 * Hand the new run to `workflow-step` instead of calling `executeWorkflow`
 * inline. Recursing through finalization would nest every target inside one
 * Edge Function invocation and blow the wall clock; the queue row also means a
 * dropped HTTP kick is still recovered by the next scheduler tick.
 */
async function enqueueRunStart(
  admin: AdminClient,
  runId: string,
  userId: string,
  nodeId: string,
): Promise<void> {
  await admin.from('workflow_step_queue').insert({
    run_id: runId,
    user_id: userId,
    node_id: nodeId,
    execute_after: new Date().toISOString(),
    status: 'pending',
  });

  const base = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('WORKFLOW_SCHEDULER_SECRET');
  if (!base || !secret) return;

  const next = fetch(`${base.replace(/\/$/, '')}/functions/v1/workflow-step`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: '{}',
  }).then(async (res) => {
    if (!res.ok) await res.text().catch(() => '');
  }).catch(() => undefined);

  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(next);
  await Promise.race([
    next,
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

export interface AdvanceResult {
  spawned: boolean;
  runId?: string;
  batchIndex?: number;
  label?: string;
  reason?: 'active-run' | 'batch-drained' | 'batch-inactive' | 'batch-missing' | 'index-taken';
}

/**
 * Start the next target of a batch, if and only if nothing else is running for
 * it. Safe to call concurrently from run finalization and the minute scheduler:
 * the partial unique index on (batch_id, batch_index) resolves the race in the
 * database rather than in application logic.
 */
export async function advanceRunBatch(
  admin: AdminClient,
  batchId: string,
): Promise<AdvanceResult> {
  const batch = await loadBatch(admin, batchId);
  if (!batch) return { spawned: false, reason: 'batch-missing' };
  if (batch.status !== 'running') return { spawned: false, reason: 'batch-inactive' };

  // Linearity: Apify free tier cannot absorb concurrent actor runs.
  if (await hasActiveRun(admin, batchId)) return { spawned: false, reason: 'active-run' };

  const targets = Array.isArray(batch.targets) ? batch.targets : [];
  const index = await nextBatchIndex(admin, batchId, Number(batch.cursor ?? 0));
  if (index >= targets.length) {
    await finishBatch(admin, batchId, 'completed');
    return { spawned: false, reason: 'batch-drained' };
  }

  const target = targets[index];
  const { nodes, edges } = await loadWorkflowGraph(admin, batch.workflow_id);
  const entry = getEntryNodes(nodes, edges)[0];
  if (!entry) {
    await finishBatch(admin, batchId, 'completed');
    return { spawned: false, reason: 'batch-drained' };
  }

  const { data: run, error } = await admin.from('workflow_runs').insert({
    workflow_id: batch.workflow_id,
    user_id: batch.user_id,
    status: 'running',
    started_at: new Date().toISOString(),
    duration_ms: 0,
    context: buildTargetRunContext(target, index),
    trigger_type: batch.trigger_type ?? null,
    batch_id: batchId,
    batch_index: index,
    batch_total: targets.length,
    search_label: target.label,
  }).select('id').single();

  if (error) {
    // Someone else already claimed this index. Move the cursor past it so the
    // next call looks at the following target instead of spinning here.
    if (isDuplicateConstraintError(error)) {
      await admin.from('workflow_run_batches')
        .update({ cursor: index + 1 })
        .eq('id', batchId)
        .lt('cursor', index + 1);
      return { spawned: false, reason: 'index-taken' };
    }
    throw error;
  }

  const runId = String(run.id);
  await admin.from('workflow_run_batches')
    .update({ cursor: index + 1 })
    .eq('id', batchId)
    .lt('cursor', index + 1);

  await enqueueRunStart(admin, runId, batch.user_id, String(entry.id));

  return { spawned: true, runId, batchIndex: index, label: target.label };
}

/**
 * Scheduler sweep. Also the recovery path: when a run is reaped by
 * `recoverStaleWorkflowState`, its batch has no active run and resumes here.
 */
export async function advancePendingBatches(admin: AdminClient): Promise<number> {
  const { data: batches } = await admin
    .from('workflow_run_batches')
    .select('id')
    .eq('status', 'running')
    .order('created_at', { ascending: true })
    .limit(20);
  if (!batches?.length) return 0;

  let spawned = 0;
  for (const batch of batches) {
    try {
      const result = await advanceRunBatch(admin, String(batch.id));
      if (result.spawned) spawned++;
    } catch (err) {
      console.error(`advanceRunBatch failed for batch ${batch.id}:`, err);
    }
  }
  return spawned;
}

/** Stop a batch so no further targets start after the user cancels a run. */
export async function cancelRunBatch(admin: AdminClient, batchId: string): Promise<void> {
  await finishBatch(admin, batchId, 'cancelled');
}

export async function batchIdForRun(admin: AdminClient, runId: string): Promise<string | null> {
  const { data } = await admin
    .from('workflow_runs')
    .select('batch_id')
    .eq('id', runId)
    .maybeSingle();
  const batchId = data?.batch_id;
  return batchId ? String(batchId) : null;
}
