import type {
  JobExecution,
  NodeExecution,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowSnapshot,
  WorkflowSnapshotNode,
} from '@/types';

export interface GraphNodeView {
  key: string;
  workflowNodeId: string;
  name: string;
  type: string;
  status: WorkflowRunStatus | 'pending';
  jobIndex?: number;
  attempt?: number;
  nodeExecutionId?: string;
  jobExecutionId?: string;
  durationMs?: number;
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JobBranchView {
  jobIndex: number;
  label: string;
  status: WorkflowRunStatus | 'pending';
  attempt: number;
  jobExecutionId: string;
  nodes: GraphNodeView[];
}

export interface ExecutionGraphView {
  commonNodes: GraphNodeView[];
  jobBranches: JobBranchView[];
  fanInNodes: GraphNodeView[];
  isLegacy: boolean;
  jobsTotal: number;
  jobsSuccessful: number;
  jobsFailed: number;
  jobsSkipped: number;
}

function isPipelineStart(node: WorkflowSnapshotNode): boolean {
  return node.type === 'supabase' && (node.config.action as string || 'insert_job') === 'insert_job';
}

function isAggregateNode(node: WorkflowSnapshotNode): boolean {
  return node.type === 'function' && node.config.builtin === 'email_summary';
}

function sortNodes(nodes: WorkflowSnapshotNode[]): WorkflowSnapshotNode[] {
  return [...nodes].sort((a, b) => a.positionX - b.positionX);
}

function buildChainFrom(
  startId: string,
  nodes: WorkflowSnapshotNode[],
  edges: WorkflowSnapshot['edges'],
  stopBeforeAggregate = true,
): WorkflowSnapshotNode[] {
  const chain: WorkflowSnapshotNode[] = [];
  let currentId: string | null = startId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodes.find((n) => n.id === currentId);
    if (!node) break;
    if (stopBeforeAggregate && isAggregateNode(node)) break;
    chain.push(node);
    const edge = edges.find((e) => e.sourceId === currentId);
    currentId = edge?.targetId ?? null;
    const next = currentId ? nodes.find((n) => n.id === currentId) : undefined;
    if (next && stopBeforeAggregate && isAggregateNode(next)) break;
  }
  return chain;
}

export function latestJobAttempts(jobs: JobExecution[]): JobExecution[] {
  const byIndex = new Map<number, JobExecution>();
  for (const job of jobs) {
    const existing = byIndex.get(job.jobIndex);
    if (!existing || job.attempt > existing.attempt) byIndex.set(job.jobIndex, job);
  }
  return Array.from(byIndex.values()).sort((a, b) => a.jobIndex - b.jobIndex);
}

function nodeStatusFromExecution(
  exec: NodeExecution | undefined,
  fallback: WorkflowRunStatus | 'pending' = 'pending',
): WorkflowRunStatus | 'pending' {
  return exec?.status ?? fallback;
}

function toGraphNode(
  template: WorkflowSnapshotNode,
  exec: NodeExecution | undefined,
  scope: { jobIndex?: number; attempt?: number; jobExecutionId?: string },
): GraphNodeView {
  return {
    key: `${template.id}-${scope.jobIndex ?? 'common'}-${scope.attempt ?? 1}`,
    workflowNodeId: template.id,
    name: template.name,
    type: template.type,
    status: nodeStatusFromExecution(exec),
    jobIndex: scope.jobIndex,
    attempt: scope.attempt ?? exec?.attempt,
    nodeExecutionId: exec?.id,
    jobExecutionId: scope.jobExecutionId ?? exec?.jobExecutionId,
    durationMs: exec?.durationMs,
    errorType: exec?.errorType,
    errorCode: exec?.errorCode,
    errorMessage: exec?.errorMessage,
    startedAt: exec?.startedAt,
    completedAt: exec?.completedAt,
  };
}

export function buildExecutionGraph(input: {
  snapshot?: WorkflowSnapshot;
  jobExecutions: JobExecution[];
  nodeExecutions: NodeExecution[];
  run: Pick<WorkflowRun, 'nodeResults' | 'jobsTotal' | 'jobsSuccessful' | 'jobsFailed' | 'jobsSkipped'>;
}): ExecutionGraphView {
  const latestJobs = latestJobAttempts(input.jobExecutions);
  const jobsTotal = input.run.jobsTotal ?? latestJobs.length;
  const jobsSuccessful = input.run.jobsSuccessful ?? latestJobs.filter((j) => j.status === 'success').length;
  const jobsFailed = input.run.jobsFailed ?? latestJobs.filter((j) => j.status === 'failed').length;
  const jobsSkipped = input.run.jobsSkipped ?? latestJobs.filter((j) => j.status === 'skipped').length;

  if (!input.snapshot?.nodes?.length) {
    return buildLegacyGraph(input.run, latestJobs, input.nodeExecutions, {
      jobsTotal,
      jobsSuccessful,
      jobsFailed,
      jobsSkipped,
    });
  }

  const nodes = sortNodes(input.snapshot.nodes);
  const edges = input.snapshot.edges || [];
  const pipelineStart = nodes.find(isPipelineStart);
  const aggregate = nodes.find(isAggregateNode);

  const commonNodes: GraphNodeView[] = [];
  if (pipelineStart) {
    const beforePipeline = nodes.filter((n) => n.positionX < pipelineStart.positionX);
    for (const node of beforePipeline) {
      const exec = input.nodeExecutions
        .filter((n) => n.workflowNodeId === node.id && !n.jobExecutionId)
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
      commonNodes.push(toGraphNode(node, exec, {}));
    }
  } else {
    for (const node of nodes.filter((n) => !isAggregateNode(n))) {
      const exec = input.nodeExecutions.find((n) => n.workflowNodeId === node.id && !n.jobExecutionId);
      commonNodes.push(toGraphNode(node, exec, {}));
    }
  }

  const jobChain = pipelineStart ? buildChainFrom(pipelineStart.id, nodes, edges) : [];
  const fanInNodes: GraphNodeView[] = [];
  if (aggregate) {
    const tail = buildChainFrom(aggregate.id, nodes, edges, false);
    for (const node of tail) {
      const exec = input.nodeExecutions
        .filter((n) => n.workflowNodeId === node.id && !n.jobExecutionId)
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
      fanInNodes.push(toGraphNode(node, exec, {}));
    }
  }

  const jobBranches: JobBranchView[] = latestJobs.map((job) => {
    const jobNodeExecs = input.nodeExecutions.filter((n) => n.jobExecutionId === job.id);
    const branchNodes = jobChain.map((template) => {
      const exec = jobNodeExecs
        .filter((n) => n.workflowNodeId === template.id && n.attempt === job.attempt)
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0]
        || jobNodeExecs.find((n) => n.workflowNodeId === template.id);
      return toGraphNode(template, exec, {
        jobIndex: job.jobIndex,
        attempt: job.attempt,
        jobExecutionId: job.id,
      });
    });
    return {
      jobIndex: job.jobIndex,
      label: job.label || `Job ${job.jobIndex}`,
      status: job.status,
      attempt: job.attempt,
      jobExecutionId: job.id,
      nodes: branchNodes,
    };
  });

  return {
    commonNodes,
    jobBranches,
    fanInNodes,
    isLegacy: latestJobs.length === 0,
    jobsTotal,
    jobsSuccessful,
    jobsFailed,
    jobsSkipped,
  };
}

function buildLegacyGraph(
  run: Pick<WorkflowRun, 'nodeResults'>,
  jobs: JobExecution[],
  nodeExecutions: NodeExecution[],
  counters: { jobsTotal: number; jobsSuccessful: number; jobsFailed: number; jobsSkipped: number },
): ExecutionGraphView {
  const resultMap = new Map(run.nodeResults.map((n) => [n.nodeId, n]));
  const commonNodes: GraphNodeView[] = run.nodeResults.map((nr) => ({
    key: `legacy-${nr.nodeId}`,
    workflowNodeId: nr.nodeId,
    name: nr.nodeId,
    type: 'legacy',
    status: nr.status,
    durationMs: nr.duration,
  }));

  const jobBranches: JobBranchView[] = jobs.map((job) => ({
    jobIndex: job.jobIndex,
    label: job.label || `Job ${job.jobIndex}`,
    status: job.status,
    attempt: job.attempt,
    jobExecutionId: job.id,
    nodes: nodeExecutions
      .filter((n) => n.jobExecutionId === job.id)
      .map((exec) => ({
        key: `${exec.workflowNodeId}-${job.jobIndex}-${exec.attempt}`,
        workflowNodeId: exec.workflowNodeId,
        name: exec.nodeName,
        type: exec.nodeType,
        status: exec.status,
        jobIndex: job.jobIndex,
        attempt: exec.attempt,
        nodeExecutionId: exec.id,
        jobExecutionId: job.id,
        durationMs: exec.durationMs,
        errorType: exec.errorType,
        errorCode: exec.errorCode,
        errorMessage: exec.errorMessage,
        startedAt: exec.startedAt,
        completedAt: exec.completedAt,
      })),
  }));

  return {
    commonNodes,
    jobBranches,
    fanInNodes: [],
    isLegacy: true,
    ...counters,
  };
}

export function filterLogsForNode(
  logs: WorkflowRun['logs'],
  node: GraphNodeView,
): WorkflowRun['logs'] {
  if (node.nodeExecutionId) {
    const scoped = logs.filter((l) => l.nodeExecutionId === node.nodeExecutionId);
    if (scoped.length) return scoped;
  }
  if (node.jobExecutionId) {
    const scoped = logs.filter((l) => l.jobExecutionId === node.jobExecutionId && l.nodeId === node.workflowNodeId);
    if (scoped.length) return scoped;
    if (node.jobIndex != null) {
      return logs.filter(
        (l) => l.jobIndex === node.jobIndex && l.nodeId === node.workflowNodeId,
      );
    }
  }
  return logs.filter((l) => l.nodeId === node.workflowNodeId && l.jobIndex == null);
}
