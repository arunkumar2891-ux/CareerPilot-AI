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
  startNodeExecution,
} from './execution-persistence.ts';
import { deriveRunStatus } from './execution-status.ts';
import { RunCancelledError, assertRunActive, isRunCancelled, recoverStaleWorkflowState } from './run-lifecycle.ts';
import type { RunContext, WorkflowEdgeRow, WorkflowNodeRow } from './types.ts';

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
  options?: { triggerType?: string; triggeredBy?: string },
) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('workflow_runs').insert({
    workflow_id: workflowId,
    user_id: userId,
    status: 'running',
    started_at: new Date().toISOString(),
    duration_ms: 0,
    context: {},
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
  else await next;
}

async function runDurationMs(admin: ReturnType<typeof createAdminClient>, runId: string): Promise<number> {
  const { data: run } = await admin.from('workflow_runs').select('started_at').eq('id', runId).single();
  if (!run?.started_at) return 0;
  return Date.now() - new Date(run.started_at as string).getTime();
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

  if (existingRunId) {
    const { data: run } = await admin.from('workflow_runs').select('*').eq('id', existingRunId).single();
    if (!run) throw new Error('Run not found');
    if (run.status === 'cancelled') return { runId: run.id, status: 'cancelled' };
    runId = run.id;
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

  const startNodes = resumeNodeId
    ? nodes.filter((n) => n.id === resumeNodeId)
    : getEntryNodes(nodes, edges);

  let queue = [...startNodes];
  const visited = new Set<string>();
  let iterations = 0;
  const maxIterations = 100;

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
          await recordNodeRun(admin, runId, userId, node.id, 'success', duration, []);
          await touchRunDuration(admin, runId);
          await logStep(runId, userId, node.id, 'info', `Skipped: no items to process`);
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
    .limit(10);

  if (!steps?.length) return 0;

  for (const step of steps) {
    await admin.from('workflow_step_queue').update({ status: 'processing' }).eq('id', step.id);
    const { data: run } = await admin
      .from('workflow_runs')
      .select('workflow_id, user_id, current_node_id, status')
      .eq('id', step.run_id)
      .single();
    if (!run) continue;
    if (run.status !== 'running' && run.status !== 'queued') {
      await admin.from('workflow_step_queue').update({ status: 'done' }).eq('id', step.id);
      continue;
    }

    const { nodes, edges } = await loadWorkflow(run.workflow_id, run.user_id);
    const currentNode = nodes.find((n) => n.id === step.node_id);
    if (!currentNode) continue;

    await executeWorkflow(run.workflow_id, run.user_id, step.run_id, step.node_id);
    await admin.from('workflow_step_queue').update({ status: 'done' }).eq('id', step.id);
  }
  return steps.length;
}

export async function processScheduledAutomations(): Promise<number> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: automations } = await admin
    .from('automations')
    .select('*')
    .eq('status', 'active')
    .or(`next_run.is.null,next_run.lte.${now}`)
    .limit(20);

  if (!automations?.length) return 0;

  for (const auto of automations) {
    await executeWorkflow(auto.workflow_id, auto.user_id, undefined, undefined, { triggerType: 'schedule' });
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(7, 0, 0, 0);
    await admin.from('automations').update({
      last_run: now,
      next_run: nextRun.toISOString(),
    }).eq('id', auto.id);
  }
  return automations.length;
}
