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

export interface WorkflowNodeRef {
  id: string;
  name: string;
  type: string;
  positionX: number;
  positionY?: number;
  config?: Record<string, unknown>;
}

export interface WorkflowEdgeRef {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export function buildNodeNameLookup(input: {
  workflowNodes?: WorkflowNodeRef[];
  nodeExecutions?: NodeExecution[];
  logs?: WorkflowRun['logs'];
}): Map<string, { name: string; type?: string; positionX?: number }> {
  const map = new Map<string, { name: string; type?: string; positionX?: number }>();
  for (const node of input.workflowNodes ?? []) {
    map.set(node.id, { name: node.name, type: node.type, positionX: node.positionX });
  }
  for (const exec of input.nodeExecutions ?? []) {
    if (exec.nodeName) {
      map.set(exec.workflowNodeId, {
        name: exec.nodeName,
        type: exec.nodeType,
        positionX: map.get(exec.workflowNodeId)?.positionX,
      });
    }
  }
  for (const log of input.logs ?? []) {
    if (!log.nodeId) continue;
    const match = log.message.match(/(?:Executing|Completed) node:\s*(.+?)\s*\(([^)]+)\)/);
    if (!match) continue;
    const existing = map.get(log.nodeId);
    map.set(log.nodeId, {
      name: match[1].trim(),
      type: match[2].trim(),
      positionX: existing?.positionX,
    });
  }
  return map;
}

function snapshotFromWorkflow(
  workflowNodes: WorkflowNodeRef[],
  workflowEdges: WorkflowEdgeRef[] = [],
  base?: WorkflowSnapshot,
): WorkflowSnapshot {
  return {
    workflowId: base?.workflowId ?? '',
    workflowName: base?.workflowName ?? 'Workflow',
    capturedAt: base?.capturedAt ?? '',
    nodes: workflowNodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      positionX: n.positionX,
      positionY: n.positionY ?? 0,
      config: n.config ?? {},
    })),
    edges: workflowEdges,
  };
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
  result?: { status: WorkflowRunStatus; duration: number },
): GraphNodeView {
  return {
    key: `${template.id}-${scope.jobIndex ?? 'common'}-${scope.attempt ?? 1}`,
    workflowNodeId: template.id,
    name: template.name,
    type: template.type,
    status: nodeStatusFromExecution(exec, result?.status ?? 'pending'),
    jobIndex: scope.jobIndex,
    attempt: scope.attempt ?? exec?.attempt,
    nodeExecutionId: exec?.id,
    jobExecutionId: scope.jobExecutionId ?? exec?.jobExecutionId,
    durationMs: exec?.durationMs ?? result?.duration,
    errorType: exec?.errorType,
    errorCode: exec?.errorCode,
    errorMessage: exec?.errorMessage,
    startedAt: exec?.startedAt,
    completedAt: exec?.completedAt,
  };
}

export function buildExecutionGraph(input: {
  snapshot?: WorkflowSnapshot;
  workflowNodes?: WorkflowNodeRef[];
  workflowEdges?: WorkflowEdgeRef[];
  jobExecutions: JobExecution[];
  nodeExecutions: NodeExecution[];
  logs?: WorkflowRun['logs'];
  run: Pick<WorkflowRun, 'nodeResults' | 'jobsTotal' | 'jobsSuccessful' | 'jobsFailed' | 'jobsSkipped'>;
}): ExecutionGraphView {
  const latestJobs = latestJobAttempts(input.jobExecutions);
  const jobsTotal = input.run.jobsTotal ?? latestJobs.length;
  const jobsSuccessful = input.run.jobsSuccessful ?? latestJobs.filter((j) => j.status === 'success').length;
  const jobsFailed = input.run.jobsFailed ?? latestJobs.filter((j) => j.status === 'failed').length;
  const jobsSkipped = input.run.jobsSkipped ?? latestJobs.filter((j) => j.status === 'skipped').length;
  const usedPersistedSnapshot = Boolean(input.snapshot?.nodes?.length);
  const isLegacy = !usedPersistedSnapshot;

  const nameLookup = buildNodeNameLookup({
    workflowNodes: input.workflowNodes,
    nodeExecutions: input.nodeExecutions,
    logs: input.logs,
  });

  let snapshot = input.snapshot;
  if (!snapshot?.nodes?.length && input.workflowNodes?.length) {
    snapshot = snapshotFromWorkflow(input.workflowNodes, input.workflowEdges, input.snapshot);
  }

  if (!snapshot?.nodes?.length) {
    return buildLegacyGraph(input.run, latestJobs, input.nodeExecutions, nameLookup, {
      jobsTotal,
      jobsSuccessful,
      jobsFailed,
      jobsSkipped,
    });
  }

  const resultMap = new Map(input.run.nodeResults.map((n) => [n.nodeId, n]));
  const nodes = sortNodes(snapshot.nodes);
  const edges = snapshot.edges || [];
  const pipelineStart = nodes.find(isPipelineStart);
  const aggregate = nodes.find(isAggregateNode);

  const commonNodes: GraphNodeView[] = [];
  if (pipelineStart) {
    const beforePipeline = nodes.filter((n) => n.positionX < pipelineStart.positionX);
    for (const node of beforePipeline) {
      const exec = input.nodeExecutions
        .filter((n) => n.workflowNodeId === node.id && !n.jobExecutionId)
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
      commonNodes.push(toGraphNode(node, exec, {}, resultMap.get(node.id)));
    }
  } else {
    for (const node of nodes.filter((n) => !isAggregateNode(n))) {
      const exec = input.nodeExecutions.find((n) => n.workflowNodeId === node.id && !n.jobExecutionId);
      commonNodes.push(toGraphNode(node, exec, {}, resultMap.get(node.id)));
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
      fanInNodes.push(toGraphNode(node, exec, {}, resultMap.get(node.id)));
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
      }, resultMap.get(template.id));
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
    isLegacy,
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
  nameLookup: Map<string, { name: string; type?: string; positionX?: number }>,
  counters: { jobsTotal: number; jobsSuccessful: number; jobsFailed: number; jobsSkipped: number },
): ExecutionGraphView {
  const commonNodes: GraphNodeView[] = [...run.nodeResults]
    .sort((a, b) => {
      const posA = nameLookup.get(a.nodeId)?.positionX ?? Number.MAX_SAFE_INTEGER;
      const posB = nameLookup.get(b.nodeId)?.positionX ?? Number.MAX_SAFE_INTEGER;
      return posA - posB;
    })
    .map((nr) => {
      const meta = nameLookup.get(nr.nodeId);
      return {
        key: `legacy-${nr.nodeId}`,
        workflowNodeId: nr.nodeId,
        name: meta?.name || nr.nodeId,
        type: meta?.type || 'legacy',
        status: nr.status,
        durationMs: nr.duration,
      };
    });

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
        name: exec.nodeName || nameLookup.get(exec.workflowNodeId)?.name || exec.workflowNodeId,
        type: exec.nodeType || nameLookup.get(exec.workflowNodeId)?.type || 'legacy',
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
