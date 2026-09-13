import { createAdminClient } from '../supabase-admin.ts';
import { getUserSettings } from '../credentials.ts';
import { getEntryNodes, getNextNodeId } from './graph.ts';
import { getExecutor } from './nodes.ts';
import {
  buildPerJobPipelineChain,
  ensureJobExecutionsInitialized,
  executePerJobPipeline,
  isJobPipelineStart,
  prepareRetryJobQueue,
} from './job-pipeline.ts';
import {
  completeNodeExecution,
  insertStructuredLog,
  refreshRunJobCounters,
  saveWorkflowSnapshot,
  shouldSaveWorkflowSnapshot,
  startNodeExecution,
} from './execution-persistence.ts';
import { deriveRunStatus } from './execution-status.ts';
import { storedFileLogMessages } from '../resume-store.ts';
import { isDuplicateConstraintError } from '../job-dedupe.ts';
import {
  computeNextCronRun,
  pickCanonicalAutomations,
  scheduleSlotKey,
  shouldStartScheduledAutomation,
  startOfUtcDay,
  utcDateKey,
} from '../cron-schedule.ts';
import { RunCancelledError, assertRunActive, isRunCancelled, recoverStaleWorkflowState } from './run-lifecycle.ts';
import {
  currentSearchLabel,
  findRoleLoopStart,
  searchRoleForNode,
} from './role-loop.ts';
import { buildSearchTargets } from '../job-search-roles.ts';
import { advancePendingBatches, advanceRunBatch, cancelRunBatch, createRunBatch } from './run-batch.ts';
import type { RunContext } from './types.ts';

export async function loadWorkflow(workflowId: string, userId: string) {
  const admin = createAdminClient();
  const { data: workflow, error } = await admin
    .from('workflows')
    .select('*, workflow_nodes(*), workflow_edges(*)')
    .eq('id', workflowId)
    .eq('user_id', userId)
    .single();
  if (error || !workflow) throw new Error('Workflow not found');
  const nodes = (workflow.workflow_nodes || []) as WorkflowNodeRow[];
  const edges = (workflow.workflow_edges || []) as WorkflowEdgeRow[];
  return { workflow, nodes, edges };
}

export async function createRun(
  workflowId: string,
  userId: string,
  options?: { triggerType?: string; triggeredBy?: string; context?: Record<string, unknown> },
) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('workflow_runs').insert({
    workflow_id: workflowId,
    user_id: userId,
    status: 'running',
    started_at: new Date().toISOString(),
    duration_ms: 0,
    context: options?.context ?? {},
    trigger_type: options?.triggerType ?? null,
  }).select().single();
  if (error) throw error;
  return data;
}

async function logStep(
  runId: string,
  userId: string,
  nodeId: string,
  level: string,
  message: string,
  extra?: {
    jobExecutionId?: string | null;
    nodeExecutionId?: string | null;
    jobIndex?: number | null;
    attempt?: number | null;
  },
) {
  const admin = createAdminClient();
  await insertStructuredLog(admin, {
    runId,
    userId,
    nodeId,
    level,
    message,
    jobExecutionId: extra?.jobExecutionId,
    nodeExecutionId: extra?.nodeExecutionId,
    jobIndex: extra?.jobIndex,
    attempt: extra?.attempt,
  });
}

export async function cancelWorkflowRun(runId: string, userId: string): Promise<{ status: string }> {
  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();
  if (error || !run) throw new Error('Run not found');
  if (run.status !== 'running' && run.status !== 'queued') {
    throw new Error(`Cannot stop run with status: ${run.status}`);
  }

  const duration = run.started_at
    ? Date.now() - new Date(run.started_at as string).getTime()
    : 0;

  const { error: updateError } = await admin.from('workflow_runs').update({
    status: 'cancelled',
    finished_at: new Date().toISOString(),
    error_message: 'Stopped by user',
    duration_ms: duration,
    current_node_id: null,
  }).eq('id', runId).eq('user_id', userId);
  if (updateError) throw updateError;

  const { data: verify } = await admin.from('workflow_runs').select('status').eq('id', runId).single();
  if (verify?.status !== 'cancelled') {
    throw new Error('Stop did not persist. Run the 008_workflow_runs_cancel.sql migration, then try again.');
  }

  await admin.from('workflow_step_queue').delete().eq('run_id', runId);

  // Stop the whole batch. Otherwise Stop looks like a no-op: this target ends
  // and the scheduler immediately starts the next one.
  if (run.batch_id) {
    try {
      await cancelRunBatch(admin, String(run.batch_id));
    } catch (err) {
      console.error(`cancelRunBatch failed for batch ${run.batch_id}:`, err);
    }
  }

  let logNodeId = run.current_node_id as string | null;
  if (!logNodeId) {
    const { data: nodes } = await admin
      .from('workflow_nodes')
      .select('id')
      .eq('workflow_id', run.workflow_id)
      .limit(1);
    logNodeId = (nodes?.[0]?.id as string) || null;
  }
  if (logNodeId) {
    await logStep(runId, userId, logNodeId, 'warn', 'Execution stopped by user');
  }

  return { status: 'cancelled' };
}

async function saveRunContext(runId: string, ctx: RunContext) {
  const admin = createAdminClient();
  await admin.from('workflow_runs').update({
    context: { variables: ctx.variables, nodeOutputs: ctx.nodeOutputs },
    current_node_id: ctx.currentNodeId || null,
  }).eq('id', runId).in('status', ['running', 'queued']);
}

async function touchRunDuration(admin: ReturnType<typeof createAdminClient>, runId: string) {
  const { data: run } = await admin.from('workflow_runs').select('started_at, status').eq('id', runId).single();
  if (!run?.started_at) return;
  if (run.status === 'cancelled') return;
  const duration = Date.now() - new Date(run.started_at as string).getTime();
  await admin.from('workflow_runs').update({ duration_ms: duration }).eq('id', runId).in('status', ['running', 'queued']);
}

async function recordNodeRun(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  userId: string,
  nodeId: string,
  status: string,
  durationMs: number,
  output?: unknown,
) {
  const row = {
    status,
    duration_ms: durationMs,
    output: output !== undefined ? JSON.stringify(output).slice(0, 10000) : null,
  };
  const { data: existing } = await admin
    .from('workflow_run_nodes')
    .select('id')
    .eq('run_id', runId)
    .eq('node_id', nodeId)
    .maybeSingle();
  if (existing?.id) {
    await admin.from('workflow_run_nodes').update(row).eq('id', existing.id);
  } else {
    await admin.from('workflow_run_nodes').insert({
      run_id: runId,
      user_id: userId,
      node_id: nodeId,
      ...row,
    });
  }
}

async function enqueueNextPipelineSlice(runId: string, userId: string, nodeId: string) {
  const admin = createAdminClient();
  if (await isRunCancelled(admin, runId)) return;
  await admin.from('workflow_step_queue').delete().eq('run_id', runId).eq('status', 'pending');
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
  // Flush the HTTP request without waiting for the next job (it has its own 150s budget).
  await Promise.race([
    next,
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

async function runDurationMs(admin: ReturnType<typeof createAdminClient>, runId: string): Promise<number> {
  const { data: run } = await admin.from('workflow_runs').select('started_at').eq('id', runId).single();
  if (!run?.started_at) return 0;
  return Date.now() - new Date(run.started_at as string).getTime();
}

/**
 * Start the batch's next target once this run reaches a terminal state.
 * Never allowed to throw: the minute scheduler's `advancePendingBatches` is the
 * authoritative driver, so a failure here only delays the next target.
 */
async function kickRunBatch(
  admin: ReturnType<typeof createAdminClient>,
  batchId: string | null,
): Promise<void> {
  if (!batchId) return;
  try {
    await advanceRunBatch(admin, batchId);
  } catch (err) {
    console.error(`advanceRunBatch failed for batch ${batchId}:`, err);
  }
}

export async function executeWorkflow(
  workflowId: string,
  userId: string,
  existingRunId?: string,
  resumeNodeId?: string,
  options?: { triggerType?: string },
): Promise<{ runId: string; status: string }> {
  const admin = createAdminClient();
  const { workflow, nodes, edges } = await loadWorkflow(workflowId, userId);
  const settings = await getUserSettings(userId);

  let runId = existingRunId;
  let ctx: RunContext;
  let runBatchId: string | null = null;
  let runBatchTotal: number | null = null;

  if (existingRunId) {
    const { data: run } = await admin.from('workflow_runs').select('*').eq('id', existingRunId).single();
    if (!run) throw new Error('Run not found');
    if (run.status === 'cancelled') return { runId: run.id, status: 'cancelled' };
    runId = run.id;
    runBatchId = run.batch_id ? String(run.batch_id) : null;
    runBatchTotal = run.batch_total === null || run.batch_total === undefined
      ? null
      : Number(run.batch_total);
    const stored = (run.context as Record<string, unknown>) || {};
    ctx = {
      runId,
      workflowId,
      userId,
      variables: (stored.variables as Record<string, unknown>) || {},
      nodeOutputs: (stored.nodeOutputs as Record<string, unknown>) || {},
      settings,
      currentNodeId: resumeNodeId || run.current_node_id,
    };
    if (shouldSaveWorkflowSnapshot(run.workflow_snapshot)) {
      await saveWorkflowSnapshot(
        admin,
        runId,
        workflowId,
        String(workflow.name || 'Workflow'),
        nodes,
        edges,
      );
    }
  } else {
    const run = await createRun(workflowId, userId, { triggerType: options?.triggerType });
    runId = run.id;
    ctx = { runId, workflowId, userId, variables: {}, nodeOutputs: {}, settings };
    await saveWorkflowSnapshot(
      admin,
      runId,
      workflowId,
      String(workflow.name || 'Workflow'),
      nodes,
      edges,
    );
  }

  if (ctx.variables.retryPendingJobs) {
    await prepareRetryJobQueue(admin, runId, userId, ctx);
    delete ctx.variables.retryPendingJobs;
  }

  const roleLoopStart = findRoleLoopStart(nodes);
  // One run == one search target. The target is seeded into ctx.variables by
  // run-batch.ts; the fallback covers direct invocations and pre-batch runs.
  if (roleLoopStart && !String(ctx.variables.currentRole || '').trim()) {
    const fallback = buildSearchTargets(ctx.settings.jobSearch as Record<string, unknown> | undefined)[0];
    if (fallback) {
      ctx.variables.currentRole = fallback.role;
      ctx.variables.currentLocation = fallback.location;
      ctx.variables.remoteOnly = fallback.remoteOnly;
      ctx.variables.currentSearchLabel = fallback.label;
    }
  }
  const searchLabel = currentSearchLabel(ctx.variables);

  const startNodes = resumeNodeId
    ? nodes.filter((n) => n.id === resumeNodeId)
    : getEntryNodes(nodes, edges);

  if (!resumeNodeId && roleLoopStart && searchLabel && startNodes[0]) {
    const batchTotal = Number(runBatchTotal ?? 0);
    const batchPosition = Number(ctx.variables.batchIndex ?? 0) + 1;
    await logStep(
      runId,
      userId,
      startNodes[0].id,
      'info',
      batchTotal > 1
        ? `Search ${batchPosition}/${batchTotal}: ${searchLabel}`
        : `Search: ${searchLabel}`,
    );
  }

  const queue = [...startNodes];
  const visited = new Set<string>();
  let iterations = 0;
  const maxIterations = 400;

  while (queue.length && iterations < maxIterations) {
    iterations++;
    await assertRunActive(admin, runId);
    const node = queue.shift()!;
    if (visited.has(node.id) && !resumeNodeId) continue;
    visited.add(node.id);
    ctx.currentNodeId = node.id;

    const prevEdge = edges.find((e) => e.target_id === node.id);
    const prevOutput = prevEdge ? ctx.nodeOutputs[prevEdge.source_id] : ctx.variables;

    await logStep(runId, userId, node.id, 'info', `Executing node: ${node.name} (${node.type})`);
    const start = Date.now();
    const commonNodeExecutionId = await startNodeExecution(admin, {
      runId,
      userId,
      workflowNodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      searchRole: searchRoleForNode(node, ctx.variables),
    });

    try {
      const executor = getExecutor(node.type);
      let inputData = prevOutput;
      if (
        isJobPipelineStart(node)
        && Array.isArray(ctx.variables.pendingJobItems)
      ) {
        inputData = ctx.variables.pendingJobItems;
      }

      // One job per Edge Function slice: Store → ATS → LaTeX → PDF → Storage → Drive, then checkpoint.
      if (Array.isArray(inputData) && isJobPipelineStart(node)) {
        const chain = buildPerJobPipelineChain(node.id, nodes, edges);
        const items = inputData.filter((item) => item != null);
        if (chain.length > 0 && items.length === 0) {
          ctx.nodeOutputs[node.id] = [];
          const tail = chain[chain.length - 1];
          ctx.nodeOutputs[tail.id] = [];
          const duration = Date.now() - start;
          await completeNodeExecution(admin, commonNodeExecutionId, 'skipped', {
            durationMs: duration,
            output: [],
          });
          await recordNodeRun(admin, runId, userId, node.id, 'skipped', duration, []);
          await touchRunDuration(admin, runId);
          await logStep(
            runId,
            userId,
            node.id,
            'info',
            'No new jobs to process.',
          );
          await saveRunContext(runId, ctx);
          for (const chainNode of chain) visited.add(chainNode.id);
          const nextId = getNextNodeId(tail.id, edges);
          if (nextId) {
            const nextNode = nodes.find((n) => n.id === nextId);
            if (nextNode) queue.push(nextNode);
          }
          continue;
        }
        if (chain.length > 0 && items.length > 0) {
          await ensureJobExecutionsInitialized(admin, runId, userId, ctx, items);
          const pipelineHelpers = {
            logStep,
            saveRunContext,
            touchRunDuration,
            recordNodeRun,
          };
          const { results, yieldForNext } = await executePerJobPipeline(
            runId,
            userId,
            ctx,
            chain,
            items,
            edges,
            admin,
            pipelineHelpers,
          );
          ctx.nodeOutputs[node.id] = results;
          const tail = chain[chain.length - 1];
          ctx.nodeOutputs[tail.id] = results;
          await saveRunContext(runId, ctx);

          if (yieldForNext) {
            await enqueueNextPipelineSlice(runId, userId, node.id);
            return { runId, status: 'running' };
          }

          delete ctx.variables.batchProgress;
          for (const chainNode of chain) visited.add(chainNode.id);
          const nextId = getNextNodeId(tail.id, edges);
          if (nextId) {
            const nextNode = nodes.find((n) => n.id === nextId);
            if (nextNode) queue.push(nextNode);
          }
          continue;
        }
      }

      // Process array items sequentially for per-job nodes
      const perItemTypes = ['gemini', 'resume_optimizer', 'supabase', 'function', 'pdf', 'storage', 'gdrive'];
      const aggregateBuiltin = node.type === 'function' ? node.config.builtin as string : '';
      const isAggregateFunction = aggregateBuiltin === 'email_summary' || aggregateBuiltin === 'parse_apify_jobs';
      if (Array.isArray(inputData) && perItemTypes.includes(node.type) && !isAggregateFunction) {
        const items = inputData.filter((item) => item != null);
        if (items.length === 0) {
          ctx.nodeOutputs[node.id] = [];
          const duration = Date.now() - start;
          await completeNodeExecution(admin, commonNodeExecutionId, 'skipped', {
            durationMs: duration,
            output: [],
          });
          await recordNodeRun(admin, runId, userId, node.id, 'skipped', duration, []);
          await touchRunDuration(admin, runId);
          await logStep(runId, userId, node.id, 'info', `Skipped: no items to process (${node.name})`);
          await saveRunContext(runId, ctx);
          const nextId = getNextNodeId(node.id, edges);
          if (nextId) {
            const nextNode = nodes.find((n) => n.id === nextId);
            if (nextNode) queue.push(nextNode);
          }
          continue;
        }
        const results: unknown[] = [];
        for (let i = 0; i < items.length; i++) {
          await assertRunActive(admin, runId);
          ctx.variables.currentItem = items[i];
          ctx.variables.batchProgress = { node: node.name, index: i + 1, total: items.length };
          if (items.length > 1) {
            await logStep(runId, userId, node.id, 'info', `Processing item ${i + 1}/${items.length}: ${node.name}`);
          }
          await saveRunContext(runId, ctx);
          await touchRunDuration(admin, runId);
          const itemResult = await executor.execute(ctx, node, items[i], edges);
          if (itemResult.status === 'failed') throw new Error(itemResult.error || 'Node failed');
          results.push(itemResult.output);
          if (items.length > 1) {
            await logStep(runId, userId, node.id, 'info', `Finished item ${i + 1}/${items.length}: ${node.name}`);
          }
          await saveRunContext(runId, ctx);
          await touchRunDuration(admin, runId);
        }
        ctx.nodeOutputs[node.id] = results;
        const batchDuration = Date.now() - start;
        await recordNodeRun(admin, runId, userId, node.id, 'success', batchDuration, results);
        await touchRunDuration(admin, runId);
        await logStep(runId, userId, node.id, 'info', `Completed node: ${node.name} (${node.type}) in ${batchDuration}ms`);
        if (node.type === 'storage') {
          for (const message of storedFileLogMessages(results)) {
            await logStep(runId, userId, node.id, 'info', message);
          }
        }
        await saveRunContext(runId, ctx);
        const nextId = getNextNodeId(node.id, edges);
        if (nextId) {
          const nextNode = nodes.find((n) => n.id === nextId);
          if (nextNode) queue.push(nextNode);
        }
        continue;
      }

      const result = await executor.execute(ctx, node, inputData, edges);
      const duration = Date.now() - start;

      if (result.status === 'waiting' && result.resumeAt) {
        await completeNodeExecution(admin, commonNodeExecutionId, 'waiting', {
          durationMs: duration,
          output: result.output,
        });
        await recordNodeRun(admin, runId, userId, node.id, 'running', duration, result.output);
        await touchRunDuration(admin, runId);
        await admin.from('workflow_step_queue').insert({
          run_id: runId,
          user_id: userId,
          node_id: node.id,
          execute_after: result.resumeAt.toISOString(),
          status: 'pending',
        });
        await saveRunContext(runId, ctx);
        await logStep(runId, userId, node.id, 'info', `Waiting until ${result.resumeAt.toISOString()}: ${node.name}`);
        return { runId, status: 'running' };
      }

      if (result.status === 'failed') throw new Error(result.error || 'Node failed');

      await completeNodeExecution(admin, commonNodeExecutionId, 'success', {
        durationMs: duration,
        output: result.output,
      });
      await recordNodeRun(admin, runId, userId, node.id, 'success', duration, result.output);
      await touchRunDuration(admin, runId);
      await logStep(runId, userId, node.id, 'info', `Completed node: ${node.name} (${node.type}) in ${duration}ms`);
      if (node.type === 'storage') {
        for (const message of storedFileLogMessages(result.output)) {
          await logStep(runId, userId, node.id, 'info', message);
        }
      }

      ctx.nodeOutputs[node.id] = result.output;

      if (node.type === 'loop' || (Array.isArray(result.output) && node.config.foreach)) {
        const items = result.output as unknown[];
        ctx.items = items;
        for (const item of items) {
          ctx.variables.currentItem = item;
          const nextId = getNextNodeId(node.id, edges);
          if (nextId) {
            const nextNode = nodes.find((n) => n.id === nextId);
            if (nextNode) queue.unshift(nextNode);
          }
        }
        await saveRunContext(runId, ctx);
        continue;
      }

      const nextId = getNextNodeId(node.id, edges, result.route);
      if (nextId) {
        const nextNode = nodes.find((n) => n.id === nextId);
        if (nextNode) queue.push(nextNode);
      }

      await saveRunContext(runId, ctx);
    } catch (err) {
      if (err instanceof RunCancelledError || await isRunCancelled(admin, runId)) {
        return { runId, status: 'cancelled' };
      }
      const message = err instanceof Error ? err.message : String(err);
      const duration = await runDurationMs(admin, runId);
      await completeNodeExecution(admin, commonNodeExecutionId, 'failed', {
        durationMs: duration,
        errorMessage: message,
      });
      await recordNodeRun(admin, runId, userId, node.id, 'failed', duration);
      await logStep(runId, userId, node.id, 'error', message);
      await admin.from('workflow_runs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: message,
        duration_ms: duration,
      }).eq('id', runId).in('status', ['running', 'queued']);
      // A failed target must not strand the rest of the batch. Best-effort: the
      // minute scheduler advances the batch anyway if this kick fails.
      await kickRunBatch(admin, runBatchId);
      return { runId, status: 'failed' };
    }
  }

  if (await isRunCancelled(admin, runId)) {
    return { runId, status: 'cancelled' };
  }

  const started = await admin.from('workflow_runs').select('started_at, jobs_total, jobs_successful, jobs_failed, jobs_skipped').eq('id', runId).single();
  const duration = started.data?.started_at
    ? Date.now() - new Date(started.data.started_at).getTime()
    : 0;

  await refreshRunJobCounters(admin, runId);
  const counters = {
    total: Number(started.data?.jobs_total ?? 0),
    successful: Number(started.data?.jobs_successful ?? 0),
    failed: Number(started.data?.jobs_failed ?? 0),
    skipped: Number(started.data?.jobs_skipped ?? 0),
  };
  const { data: refreshed } = await admin
    .from('workflow_runs')
    .select('jobs_total, jobs_successful, jobs_failed, jobs_skipped')
    .eq('id', runId)
    .single();
  if (refreshed) {
    counters.total = Number(refreshed.jobs_total ?? counters.total);
    counters.successful = Number(refreshed.jobs_successful ?? counters.successful);
    counters.failed = Number(refreshed.jobs_failed ?? counters.failed);
    counters.skipped = Number(refreshed.jobs_skipped ?? counters.skipped);
  }

  const finalStatus = deriveRunStatus('success', counters, false);

  await admin.from('workflow_runs').update({
    status: finalStatus,
    finished_at: new Date().toISOString(),
    duration_ms: duration,
    current_node_id: null,
  }).eq('id', runId).eq('status', 'running');

  await admin.from('workflows').update({
    last_run: new Date().toISOString(),
  }).eq('id', workflowId);

  // This target finished; start the next one in the batch.
  await kickRunBatch(admin, runBatchId);

  return { runId, status: finalStatus };
}

export async function processDueSteps(): Promise<number> {
  const admin = createAdminClient();
  await recoverStaleWorkflowState(admin);
  const now = new Date().toISOString();
  const { data: steps } = await admin
    .from('workflow_step_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('execute_after', now)
    .order('execute_after', { ascending: true })
    .limit(10);

  for (const step of steps ?? []) {
    try {
      await admin.from('workflow_step_queue').update({ status: 'processing' }).eq('id', step.id);
      const { data: run } = await admin
        .from('workflow_runs')
        .select('workflow_id, user_id, current_node_id, status')
        .eq('id', step.run_id)
        .single();
      if (!run) {
        // Orphaned row; clear it so it does not sit in `processing` forever.
        await admin.from('workflow_step_queue').update({ status: 'done' }).eq('id', step.id);
        continue;
      }
      if (run.status !== 'running' && run.status !== 'queued') {
        await admin.from('workflow_step_queue').update({ status: 'done' }).eq('id', step.id);
        continue;
      }

      const { nodes } = await loadWorkflow(run.workflow_id, run.user_id);
      const currentNode = nodes.find((n) => n.id === step.node_id);
      if (!currentNode) {
        await admin.from('workflow_step_queue').update({ status: 'done' }).eq('id', step.id);
        continue;
      }

      await executeWorkflow(run.workflow_id, run.user_id, step.run_id, step.node_id);
      await admin.from('workflow_step_queue').update({ status: 'done' }).eq('id', step.id);
    } catch (err) {
      // One bad step must not abort the remaining steps or skip the batch sweep
      // below. The run itself is already marked failed by executeWorkflow.
      console.error(`Workflow step ${step.id} failed:`, err);
      await admin.from('workflow_step_queue').update({ status: 'done' }).eq('id', step.id);
    }
  }

  // Always runs, even with no due steps: this is the authoritative batch driver
  // and the recovery path for batches whose run was reaped by
  // recoverStaleWorkflowState or whose finalization kick never landed.
  await advancePendingBatches(admin);
  return steps?.length ?? 0;
}

async function hasScheduledRunToday(
  admin: ReturnType<typeof createAdminClient>,
  workflowId: string,
  userId: string,
  workflowName: string,
  now: Date,
): Promise<boolean> {
  const dayStart = startOfUtcDay(now).toISOString();
  const { data: sameWorkflow } = await admin
    .from('workflow_runs')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('user_id', userId)
    .eq('trigger_type', 'schedule')
    .gte('started_at', dayStart)
    .limit(1)
    .maybeSingle();
  if (sameWorkflow?.id) return true;

  const { data: siblings } = await admin
    .from('workflows')
    .select('id')
    .eq('user_id', userId)
    .eq('name', workflowName);
  const siblingIds = (siblings || []).map((row) => String(row.id)).filter((id) => id !== workflowId);
  if (!siblingIds.length) return false;

  const { data: siblingRun } = await admin
    .from('workflow_runs')
    .select('id')
    .eq('user_id', userId)
    .eq('trigger_type', 'schedule')
    .in('workflow_id', siblingIds)
    .gte('started_at', dayStart)
    .limit(1)
    .maybeSingle();
  return Boolean(siblingRun?.id);
}

async function claimScheduledAutomation(
  admin: ReturnType<typeof createAdminClient>,
  auto: { id: string; last_run: string | null },
  nowIso: string,
  nextRunIso: string,
): Promise<boolean> {
  let query = admin
    .from('automations')
    .update({ last_run: nowIso, next_run: nextRunIso })
    .eq('id', auto.id)
    .eq('status', 'active');
  query = auto.last_run
    ? query.eq('last_run', auto.last_run)
    : query.is('last_run', null);
  const { data } = await query.select('id').maybeSingle();
  return Boolean(data?.id);
}

async function claimDailyScheduleSlot(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  scheduleKey: string,
  utcDate: string,
  workflowId: string,
): Promise<boolean | 'missing-table'> {
  const { error } = await admin
    .from('scheduled_run_slots')
    .insert({
      user_id: userId,
      schedule_key: scheduleKey,
      utc_date: utcDate,
      workflow_id: workflowId,
    });
  if (error) {
    if (isDuplicateConstraintError(error)) return false;
    const message = `${error.message || ''} ${error.code || ''}`;
    if (/does not exist|schema cache|could not find the table/i.test(message)) return 'missing-table';
    throw error;
  }
  return true;
}

export async function processScheduledAutomations(): Promise<number> {
  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const { data: automations } = await admin
    .from('automations')
    .select('*')
    .eq('status', 'active')
    .limit(50);

  if (!automations?.length) return 0;

  const workflowIds = [...new Set(automations.map((auto) => String(auto.workflow_id)))];
  const { data: workflows } = await admin
    .from('workflows')
    .select('id, name')
    .in('id', workflowIds);
  const nameById = new Map((workflows || []).map((row) => [String(row.id), String(row.name || '')]));

  const canonical = pickCanonicalAutomations(
    automations.map((auto) => ({
      ...auto,
      user_id: String(auto.user_id),
      workflow_id: String(auto.workflow_id),
      created_at: (auto.created_at as string | null) ?? null,
      schedule_key: scheduleSlotKey(nameById.get(String(auto.workflow_id)) || String(auto.name || '')),
    })),
  );

  let ran = 0;
  for (const auto of canonical) {
    try {
      const schedule = String(auto.schedule || '0 7 * * *');
      let nextRunAt = auto.next_run ? new Date(auto.next_run as string) : null;
      const lastRunAt = auto.last_run ? new Date(auto.last_run as string) : null;
      const workflowName = nameById.get(auto.workflow_id) || String(auto.name || '');
      const slotKey = auto.schedule_key || scheduleSlotKey(workflowName);

      if (!nextRunAt) {
        nextRunAt = computeNextCronRun(schedule, now);
        await admin.from('automations').update({ next_run: nextRunAt.toISOString() }).eq('id', auto.id);
      }

      const alreadyRanToday = await hasScheduledRunToday(
        admin,
        auto.workflow_id,
        auto.user_id,
        workflowName,
        now,
      );
      if (!shouldStartScheduledAutomation(schedule, nextRunAt, lastRunAt, now, {
        hasScheduledRunToday: alreadyRanToday,
      })) continue;

      const nextRun = computeNextCronRun(schedule, now);
      const slot = await claimDailyScheduleSlot(
        admin,
        auto.user_id,
        slotKey,
        utcDateKey(now),
        auto.workflow_id,
      );
      if (slot === false) continue;

      const claimed = await claimScheduledAutomation(
        admin,
        { id: String(auto.id), last_run: (auto.last_run as string | null) ?? null },
        nowIso,
        nextRun.toISOString(),
      );
      if (slot === 'missing-table' && !claimed) continue;

      // Only the discovery pipeline fans out per role. A workflow without a
      // role-loop start node (e.g. Resume Tailoring) runs as a single run.
      const { nodes: autoNodes } = await loadWorkflow(auto.workflow_id, auto.user_id);
      const targets = findRoleLoopStart(autoNodes)
        ? buildSearchTargets(
          (await getUserSettings(auto.user_id)).jobSearch as Record<string, unknown> | undefined,
        )
        : [];
      const batch = targets.length
        ? await createRunBatch(admin, {
          userId: auto.user_id,
          workflowId: auto.workflow_id,
          targets,
          triggerType: 'schedule',
        })
        : null;
      if (batch) {
        await advanceRunBatch(admin, batch.id);
      } else {
        await executeWorkflow(auto.workflow_id, auto.user_id, undefined, undefined, { triggerType: 'schedule' });
      }
      ran++;
    } catch (err) {
      console.error(`Scheduled automation ${auto.id} failed:`, err);
    }
  }
  return ran;
}
