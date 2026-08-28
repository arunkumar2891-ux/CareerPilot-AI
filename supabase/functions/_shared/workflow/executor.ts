import { createAdminClient } from '../supabase-admin.ts';
import { getUserSettings } from '../credentials.ts';
import { getEntryNodes, getNextNodeId } from './graph.ts';
import { getExecutor } from './nodes.ts';
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

export async function createRun(workflowId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('workflow_runs').insert({
    workflow_id: workflowId,
    user_id: userId,
    status: 'running',
    started_at: new Date().toISOString(),
    duration_ms: 0,
    context: {},
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
) {
  const admin = createAdminClient();
  await admin.from('workflow_logs').insert({
    run_id: runId,
    user_id: userId,
    node_id: nodeId,
    level,
    message,
    timestamp: new Date().toISOString(),
  });
}

async function saveRunContext(runId: string, ctx: RunContext) {
  const admin = createAdminClient();
  await admin.from('workflow_runs').update({
    context: { variables: ctx.variables, nodeOutputs: ctx.nodeOutputs },
    current_node_id: ctx.currentNodeId || null,
  }).eq('id', runId);
}

export async function executeWorkflow(
  workflowId: string,
  userId: string,
  existingRunId?: string,
  resumeNodeId?: string,
): Promise<{ runId: string; status: string }> {
  const admin = createAdminClient();
  const { nodes, edges } = await loadWorkflow(workflowId, userId);
  const settings = await getUserSettings(userId);

  let runId = existingRunId;
  let ctx: RunContext;

  if (existingRunId) {
    const { data: run } = await admin.from('workflow_runs').select('*').eq('id', existingRunId).single();
    if (!run) throw new Error('Run not found');
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
    const run = await createRun(workflowId, userId);
    runId = run.id;
    ctx = { runId, workflowId, userId, variables: {}, nodeOutputs: {}, settings };
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
    const node = queue.shift()!;
    if (visited.has(node.id) && !resumeNodeId) continue;
    visited.add(node.id);
    ctx.currentNodeId = node.id;

    const prevEdge = edges.find((e) => e.target_id === node.id);
    const prevOutput = prevEdge ? ctx.nodeOutputs[prevEdge.source_id] : ctx.variables;

    await logStep(runId, userId, node.id, 'info', `Executing node: ${node.name} (${node.type})`);
    const start = Date.now();

    try {
      const executor = getExecutor(node.type);
      let inputData = prevOutput;

      // Process array items sequentially for per-job nodes
      const perItemTypes = ['gemini', 'resume_optimizer', 'supabase', 'function', 'pdf', 'storage', 'gdrive'];
      if (Array.isArray(inputData) && perItemTypes.includes(node.type)) {
        if (inputData.length === 0) {
          ctx.nodeOutputs[node.id] = [];
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
        for (const item of inputData) {
          if (item == null) continue;
          ctx.variables.currentItem = item;
          const itemResult = await executor.execute(ctx, node, item, edges);
          if (itemResult.status === 'failed') throw new Error(itemResult.error || 'Node failed');
          results.push(itemResult.output);
          ctx.nodeOutputs[node.id] = results;
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

      await admin.from('workflow_run_nodes').insert({
        run_id: runId,
        user_id: userId,
        node_id: node.id,
        status: result.status === 'waiting' ? 'running' : result.status,
        duration_ms: duration,
        output: JSON.stringify(result.output).slice(0, 10000),
      });

      if (result.status === 'waiting' && result.resumeAt) {
        await admin.from('workflow_step_queue').insert({
          run_id: runId,
          user_id: userId,
          node_id: node.id,
          execute_after: result.resumeAt.toISOString(),
          status: 'pending',
        });
        await saveRunContext(runId, ctx);
        return { runId, status: 'running' };
      }

      if (result.status === 'failed') throw new Error(result.error || 'Node failed');

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
      const message = err instanceof Error ? err.message : String(err);
      await logStep(runId, userId, node.id, 'error', message);
      await admin.from('workflow_runs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: message,
      }).eq('id', runId);
      return { runId, status: 'failed' };
    }
  }

  const started = await admin.from('workflow_runs').select('started_at').eq('id', runId).single();
  const duration = started.data?.started_at
    ? Date.now() - new Date(started.data.started_at).getTime()
    : 0;

  await admin.from('workflow_runs').update({
    status: 'success',
    finished_at: new Date().toISOString(),
    duration_ms: duration,
    current_node_id: null,
  }).eq('id', runId);

  await admin.from('workflows').update({
    last_run: new Date().toISOString(),
  }).eq('id', workflowId);

  return { runId, status: 'success' };
}

export async function processDueSteps(): Promise<number> {
  const admin = createAdminClient();
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
    const { data: run } = await admin.from('workflow_runs').select('workflow_id, user_id, current_node_id').eq('id', step.run_id).single();
    if (!run) continue;

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
    await executeWorkflow(auto.workflow_id, auto.user_id);
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
