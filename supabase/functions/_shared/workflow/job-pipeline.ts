import { getExecutor } from './nodes.ts';
import { getNextNodeId } from './graph.ts';
import { assertRunActive, RunCancelledError } from './run-lifecycle.ts';
import type { RunContext, WorkflowEdgeRow, WorkflowNodeRow } from './types.ts';
import type { createAdminClient } from '../supabase-admin.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

function isAggregateNode(node: WorkflowNodeRow): boolean {
  return node.type === 'function' && node.config.builtin === 'email_summary';
}

export function isJobPipelineStart(node: WorkflowNodeRow): boolean {
  return node.type === 'supabase' && (node.config.action as string || 'insert_job') === 'insert_job';
}

export function buildPerJobPipelineChain(
  startNodeId: string,
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
): WorkflowNodeRow[] {
  const chain: WorkflowNodeRow[] = [];
  let currentId: string | null = startNodeId;
  while (currentId) {
    const node = nodes.find((n) => n.id === currentId);
    if (!node) break;
    if (isAggregateNode(node)) break;
    chain.push(node);
    const nextId = getNextNodeId(currentId, edges);
    if (!nextId) break;
    const nextNode = nodes.find((n) => n.id === nextId);
    if (nextNode && isAggregateNode(nextNode)) break;
    currentId = nextId;
  }
  return chain;
}

export async function executePerJobPipeline(
  runId: string,
  userId: string,
  ctx: RunContext,
  chain: WorkflowNodeRow[],
  items: unknown[],
  edges: WorkflowEdgeRow[],
  admin: AdminClient,
  helpers: {
    logStep: (runId: string, userId: string, nodeId: string, level: string, message: string) => Promise<void>;
    saveRunContext: (runId: string, ctx: RunContext) => Promise<void>;
    touchRunDuration: (admin: AdminClient, runId: string) => Promise<void>;
    recordNodeRun: (
      admin: AdminClient,
      runId: string,
      userId: string,
      nodeId: string,
      status: string,
      durationMs: number,
      output?: unknown,
    ) => Promise<void>;
  },
): Promise<{ results: unknown[]; yieldForNext: boolean }> {
  if (!Array.isArray(ctx.variables.processedJobs)) ctx.variables.processedJobs = [];
  const pipelineResults = Array.isArray(ctx.variables.jobPipelineResults)
    ? [...(ctx.variables.jobPipelineResults as unknown[])]
    : [];

  const queue = (Array.isArray(ctx.variables.pendingJobItems)
    ? ctx.variables.pendingJobItems
    : items).filter((item) => item != null);
  const total = Number(ctx.variables.jobPipelineTotal) || queue.length;
  ctx.variables.jobPipelineTotal = total;

  if (queue.length === 0) {
    ctx.variables.pendingJobItems = [];
    return { results: pipelineResults, yieldForNext: false };
  }

  const index = total - queue.length;
  const item = queue[0];
  ctx.variables.currentItem = item;
  ctx.variables.batchProgress = {
    node: chain[0]?.name || 'Pipeline',
    index: index + 1,
    total,
  };
  await helpers.logStep(runId, userId, chain[0].id, 'info', `Starting job ${index + 1}/${total} pipeline`);
  await helpers.saveRunContext(runId, ctx);
  await helpers.touchRunDuration(admin, runId);

  const jobStart = Date.now();
  let itemData: unknown = item;
  let jobFailed = false;

  for (const chainNode of chain) {
    await assertRunActive(admin, runId);
    ctx.currentNodeId = chainNode.id;
    ctx.variables.batchProgress = { node: chainNode.name, index: index + 1, total };
    await helpers.logStep(
      runId,
      userId,
      chainNode.id,
      'info',
      `Executing node: ${chainNode.name} (${chainNode.type}) [job ${index + 1}/${total}]`,
    );
    await helpers.saveRunContext(runId, ctx);
    await helpers.touchRunDuration(admin, runId);

    const stepStart = Date.now();
    try {
      const executor = getExecutor(chainNode.type);
      const itemResult = await executor.execute(ctx, chainNode, itemData, edges);
      if (itemResult.status === 'failed') {
        throw new Error(itemResult.error || `${chainNode.name} failed`);
      }
      const stepDuration = Date.now() - stepStart;
      itemData = itemResult.output;
      ctx.nodeOutputs[chainNode.id] = itemData;
      await helpers.recordNodeRun(
        admin,
        runId,
        userId,
        chainNode.id,
        'success',
        stepDuration,
        itemData,
      );
      await helpers.logStep(
        runId,
        userId,
        chainNode.id,
        'info',
        `Completed node: ${chainNode.name} (${chainNode.type}) in ${stepDuration}ms [job ${index + 1}/${total}]`,
      );
    } catch (err) {
      if (err instanceof RunCancelledError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      jobFailed = true;
      await helpers.recordNodeRun(admin, runId, userId, chainNode.id, 'failed', Date.now() - stepStart);
      await helpers.logStep(
        runId,
        userId,
        chainNode.id,
        'error',
        `Job ${index + 1}/${total} failed at ${chainNode.name}: ${message}`,
      );
      break;
    }
  }

  if (!jobFailed && itemData != null) {
    pipelineResults.push(itemData);
    await helpers.logStep(
      runId,
      userId,
      chain[chain.length - 1].id,
      'info',
      `Finished job ${index + 1}/${total} pipeline in ${Date.now() - jobStart}ms`,
    );
  }

  const remaining = queue.slice(1);
  ctx.variables.pendingJobItems = remaining;
  ctx.variables.jobPipelineResults = pipelineResults;
  await helpers.saveRunContext(runId, ctx);
  await helpers.touchRunDuration(admin, runId);

  if (remaining.length > 0) {
    await helpers.logStep(
      runId,
      userId,
      chain[0].id,
      'info',
      `Checkpoint: ${remaining.length} job(s) left. Starting next slice to stay under the Edge Function time limit.`,
    );
    return { results: pipelineResults, yieldForNext: true };
  }

  ctx.variables.pendingJobItems = [];
  return { results: pipelineResults, yieldForNext: false };
}
