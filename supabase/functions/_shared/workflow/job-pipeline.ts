import { getExecutor } from './nodes.ts';
import { getNextNodeId } from './graph.ts';
import { assertRunActive, RunCancelledError } from './run-lifecycle.ts';
import {
  completeJobExecution,
  completeNodeExecution,
  getJobExecutionForAttempt,
  initializeJobExecutions,
  insertStructuredLog,
  skipRemainingJobNodes,
  startJobExecution,
  startNodeExecution,
  type JobExecutionRow,
} from './execution-persistence.ts';
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

export async function ensureJobExecutionsInitialized(
  admin: AdminClient,
  runId: string,
  userId: string,
  ctx: RunContext,
  items: unknown[],
): Promise<void> {
  if (ctx.variables.jobExecutionsInitialized) return;
  const rows = await initializeJobExecutions(admin, runId, userId, items);
  ctx.variables.jobExecutionsInitialized = true;
  ctx.variables.jobPipelineTotal = items.length;
  ctx.variables.pendingJobExecutionIds = rows.map((r) => r.id);
}

async function resolveCurrentJobExecution(
  admin: AdminClient,
  runId: string,
  userId: string,
  ctx: RunContext,
  items: unknown[],
  index: number,
): Promise<JobExecutionRow> {
  const idQueue = ctx.variables.pendingJobExecutionIds as string[] | undefined;
  if (idQueue?.length) {
    const jobExecutionId = idQueue[0];
    const { data } = await admin
      .from('workflow_job_executions')
      .select('*')
      .eq('id', jobExecutionId)
      .maybeSingle();
    if (data) return data as JobExecutionRow;
  }

  const attempt = Number((ctx.variables.currentJobAttempt as Record<number, number> | undefined)?.[index + 1]) || 1;
  let jobExecution = await getJobExecutionForAttempt(admin, runId, index + 1, attempt);
  if (!jobExecution) {
    await ensureJobExecutionsInitialized(admin, runId, userId, ctx, items);
    jobExecution = await getJobExecutionForAttempt(admin, runId, index + 1, attempt);
  }
  if (!jobExecution) throw new Error(`Job execution record missing for job ${index + 1}`);
  return jobExecution;
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
    logStep: (
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
    ) => Promise<void>;
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

  let jobExecution = await resolveCurrentJobExecution(admin, runId, userId, ctx, items, index);
  const jobIndex = jobExecution.job_index;
  const attempt = jobExecution.attempt || 1;

  ctx.variables.currentItem = jobExecution.input_snapshot ?? item;
  ctx.variables.batchProgress = {
    node: chain[0]?.name || 'Pipeline',
    index: jobIndex,
    total,
  };

  const jobExecutionId = jobExecution.id;
  ctx.variables.currentJobExecutionId = jobExecutionId;

  await helpers.logStep(
    runId, userId, chain[0].id, 'info',
    `Starting job ${jobIndex}/${total} pipeline`,
    { jobExecutionId, jobIndex, attempt },
  );
  await startJobExecution(admin, jobExecutionId);
  await helpers.saveRunContext(runId, ctx);
  await helpers.touchRunDuration(admin, runId);

  const jobStart = Date.now();
  let itemData: unknown = jobExecution.checkpoint_data ?? item;
  let jobFailed = false;
  let failedNodeId: string | undefined;
  let failedMessage: string | undefined;

  const resumeNodeId = jobExecution.failed_node_id as string | undefined;
  let chainStartIdx = 0;
  if (resumeNodeId && jobExecution.checkpoint_data != null) {
    const resumeIdx = chain.findIndex((n) => n.id === resumeNodeId);
    if (resumeIdx >= 0) chainStartIdx = resumeIdx;
  }

  for (let ci = chainStartIdx; ci < chain.length; ci++) {
    const chainNode = chain[ci];
    await assertRunActive(admin, runId);
    ctx.currentNodeId = chainNode.id;
    ctx.variables.batchProgress = { node: chainNode.name, index: jobIndex, total };

    const nodeExecutionId = await startNodeExecution(admin, {
      runId,
      userId,
      workflowNodeId: chainNode.id,
      nodeName: chainNode.name,
      nodeType: chainNode.type,
      jobExecutionId,
      jobIndex,
      attempt,
    });

    await helpers.logStep(
      runId, userId, chainNode.id, 'info',
      `Executing node: ${chainNode.name} (${chainNode.type}) [job ${jobIndex}/${total}]`,
      { jobExecutionId, nodeExecutionId, jobIndex, attempt },
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

      await completeNodeExecution(admin, nodeExecutionId, 'success', {
        durationMs: stepDuration,
        output: itemData,
      });
      await helpers.recordNodeRun(
        admin, runId, userId, chainNode.id, 'success', stepDuration, itemData,
      );
      await helpers.logStep(
        runId, userId, chainNode.id, 'info',
        `Completed node: ${chainNode.name} (${chainNode.type}) in ${stepDuration}ms [job ${jobIndex}/${total}]`,
        { jobExecutionId, nodeExecutionId, jobIndex, attempt },
      );

      await admin.from('workflow_job_executions').update({
        checkpoint_data: itemData,
        failed_node_id: null,
        updated_at: new Date().toISOString(),
      }).eq('id', jobExecutionId);
    } catch (err) {
      if (err instanceof RunCancelledError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      jobFailed = true;
      failedNodeId = chainNode.id;
      failedMessage = message;
      const stepDuration = Date.now() - stepStart;

      await completeNodeExecution(admin, nodeExecutionId, 'failed', {
        durationMs: stepDuration,
        errorMessage: message,
      });
      await helpers.recordNodeRun(admin, runId, userId, chainNode.id, 'failed', stepDuration);
      await helpers.logStep(
        runId, userId, chainNode.id, 'error',
        `Job ${jobIndex}/${total} failed at ${chainNode.name}: ${message}`,
        { jobExecutionId, nodeExecutionId, jobIndex, attempt },
      );
      await skipRemainingJobNodes(
        admin, runId, jobExecutionId, jobIndex, attempt, chain, chainNode.id, userId,
      );
      break;
    }
  }

  const jobStartedAt = jobExecution.started_at || new Date(jobStart).toISOString();

  if (!jobFailed && itemData != null) {
    pipelineResults.push(itemData);
    const jobId = (itemData as Record<string, unknown>)?.jobId as string | undefined;
    await completeJobExecution(admin, runId, jobExecutionId, 'success', {
      jobId,
      checkpointData: itemData,
      startedAt: jobStartedAt,
    });
    await helpers.logStep(
      runId, userId, chain[chain.length - 1].id, 'info',
      `Finished job ${jobIndex}/${total} pipeline in ${Date.now() - jobStart}ms`,
      { jobExecutionId, jobIndex, attempt },
    );
  } else if (jobFailed) {
    await completeJobExecution(admin, runId, jobExecutionId, 'failed', {
      failedNodeId,
      checkpointData: itemData,
      errorMessage: failedMessage,
      startedAt: jobStartedAt,
    });
  }

  const remaining = queue.slice(1);
  const idQueue = (ctx.variables.pendingJobExecutionIds as string[] | undefined) || [];
  if (idQueue.length) ctx.variables.pendingJobExecutionIds = idQueue.slice(1);
  ctx.variables.pendingJobItems = remaining;
  ctx.variables.jobPipelineResults = pipelineResults;
  await helpers.saveRunContext(runId, ctx);
  await helpers.touchRunDuration(admin, runId);

  if (remaining.length > 0) {
    await helpers.logStep(
      runId, userId, chain[0].id, 'info',
      `Checkpoint: ${remaining.length} job(s) left. Starting next slice to stay under the Edge Function time limit.`,
      { jobIndex, attempt },
    );
    return { results: pipelineResults, yieldForNext: true };
  }

  ctx.variables.pendingJobItems = [];
  return { results: pipelineResults, yieldForNext: false };
}

export async function prepareRetryJobQueue(
  admin: AdminClient,
  runId: string,
  userId: string,
  ctx: RunContext,
): Promise<unknown[]> {
  const { data: pendingRetries } = await admin
    .from('workflow_job_executions')
    .select('*')
    .eq('run_id', runId)
    .eq('status', 'pending')
    .order('job_index', { ascending: true });

  const items: unknown[] = [];
  const attemptMap: Record<number, number> = {};
  const idQueue: string[] = [];
  for (const row of (pendingRetries || []) as JobExecutionRow[]) {
    items.push(row.input_snapshot ?? row.checkpoint_data ?? {});
    attemptMap[row.job_index] = row.attempt;
    idQueue.push(row.id);
  }
  ctx.variables.currentJobAttempt = attemptMap;
  ctx.variables.pendingJobExecutionIds = idQueue;
  ctx.variables.pendingJobItems = items;
  ctx.variables.jobPipelineTotal = items.length;
  return items;
}
