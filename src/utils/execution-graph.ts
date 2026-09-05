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

const NODE_LOG_RE = /(?:Executing|Completed) node:\s*(.+?)\s*\(([^)]+)\)/;

export function effectiveTriggerType(triggerType?: string): string {
  return triggerType || 'manual';
}

export function buildNodeNameLookup(input: {
  workflowNodes?: WorkflowNodeRef[];
  nodeExecutions?: NodeExecution[];
  logs?: WorkflowRun['logs'];
}): Map<string, { name: string; type?: string; positionX?: number; positionY?: number }> {
  const map = new Map<string, { name: string; type?: string; positionX?: number; positionY?: number }>();
  for (const node of input.workflowNodes ?? []) {
    map.set(node.id, {
      name: node.name,
      type: node.type,
      positionX: node.positionX,
      positionY: node.positionY,
    });
  }
  for (const exec of input.nodeExecutions ?? []) {
    if (exec.nodeName) {
      map.set(exec.workflowNodeId, {
        name: exec.nodeName,
        type: exec.nodeType,
        positionX: map.get(exec.workflowNodeId)?.positionX,
        positionY: map.get(exec.workflowNodeId)?.positionY,
      });
    }
  }
  for (const log of input.logs ?? []) {
    const match = log.message.match(NODE_LOG_RE);
    if (!match) continue;
    const name = match[1].trim();
    const type = match[2].trim();
    if (log.nodeId) {
      const existing = map.get(log.nodeId);
      map.set(log.nodeId, {
        name,
        type,
        positionX: existing?.positionX,
        positionY: existing?.positionY,
      });
    }
  }
  return map;
}

export interface LogNodeRef {
  nodeId?: string;
  name: string;
  type: string;
}

/** First-seen execution order and names parsed from workflow logs. */
export function extractLogNodeSequence(logs: WorkflowRun['logs'] = []): LogNodeRef[] {
  const order: LogNodeRef[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const sorted = [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  for (const log of sorted) {
    const match = log.message.match(NODE_LOG_RE);
    if (!match) continue;
    const name = match[1].trim();
    const type = match[2].trim();
    if (log.nodeId) {
      if (seenIds.has(log.nodeId)) continue;
      seenIds.add(log.nodeId);
      order.push({ nodeId: log.nodeId, name, type });
      continue;
    }
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    order.push({ name, type });
  }
  return order;
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

function findPipelineStartNode(nodes: WorkflowSnapshotNode[]): WorkflowSnapshotNode | undefined {
  return nodes.find(isPipelineStart)
    ?? nodes.find((n) => n.name === 'Store Job')
    ?? nodes.find((n) => n.type === 'supabase');
}

function findAggregateNode(nodes: WorkflowSnapshotNode[]): WorkflowSnapshotNode | undefined {
  return nodes.find(isAggregateNode)
    ?? nodes.find((n) => n.name === 'Email Summary');
}

function isFanInMeta(meta: { name: string; type?: string }): boolean {
  const name = meta.name.toLowerCase();
  return name === 'email summary'
    || name === 'send email'
    || meta.type === 'email'
    || (meta.type === 'function' && name.includes('email'));
}

function resolveNodeMeta(
  nodeId: string,
  nameLookup: Map<string, { name: string; type?: string; positionX?: number; positionY?: number }>,
  logSequence: LogNodeRef[],
  workflowNodes?: WorkflowNodeRef[],
): { name: string; type?: string; positionX?: number; positionY?: number } {
  const fromLookup = nameLookup.get(nodeId);
  if (fromLookup?.name && fromLookup.name !== nodeId) {
    const workflowNode = workflowNodes?.find((n) => n.id === nodeId || n.name === fromLookup.name);
    if (workflowNode) {
      return {
        name: workflowNode.name,
        type: workflowNode.type,
        positionX: workflowNode.positionX,
        positionY: workflowNode.positionY,
      };
    }
    return fromLookup;
  }

  const logEntry = logSequence.find((entry) => entry.nodeId === nodeId);
  if (logEntry) {
    const workflowNode = workflowNodes?.find((n) => n.id === nodeId || n.name === logEntry.name);
    return {
      name: logEntry.name,
      type: logEntry.type,
      positionX: workflowNode?.positionX ?? fromLookup?.positionX,
      positionY: workflowNode?.positionY ?? fromLookup?.positionY,
    };
  }

  const workflowNode = workflowNodes?.find((n) => n.id === nodeId);
  if (workflowNode) {
    return {
      name: workflowNode.name,
      type: workflowNode.type,
      positionX: workflowNode.positionX,
      positionY: workflowNode.positionY,
    };
  }

  return fromLookup ?? { name: nodeId, type: 'legacy' };
}

function compareGraphNodesByLayout(
  a: { workflowNodeId: string; name?: string },
  b: { workflowNodeId: string; name?: string },
  nameLookup: Map<string, { name: string; type?: string; positionX?: number; positionY?: number }>,
  logSequence: LogNodeRef[],
  workflowNodes?: WorkflowNodeRef[],
  logOrder?: Map<string, number>,
): number {
  const layoutFor = (node: { workflowNodeId: string; name?: string }) => {
    const meta = resolveNodeMeta(node.workflowNodeId, nameLookup, logSequence, workflowNodes);
    const workflowNode = workflowNodes?.find(
      (candidate) => candidate.id === node.workflowNodeId || (node.name && candidate.name === node.name),
    );
    return {
      positionX: workflowNode?.positionX ?? meta.positionX ?? logOrder?.get(node.workflowNodeId),
      positionY: workflowNode?.positionY ?? meta.positionY ?? 0,
    };
  };
  const layoutA = layoutFor(a);
  const layoutB = layoutFor(b);
  const posA = layoutA.positionX ?? Number.MAX_SAFE_INTEGER;
  const posB = layoutB.positionX ?? Number.MAX_SAFE_INTEGER;
  if (posA !== posB) return posA - posB;
  return layoutA.positionY - layoutB.positionY;
}

function mapResultsToWorkflowIds(
  nodeResults: WorkflowRun['nodeResults'],
  workflowNodes: WorkflowSnapshotNode[],
  nameLookup: Map<string, { name: string; type?: string; positionX?: number; positionY?: number }>,
  logs?: WorkflowRun['logs'],
): Map<string, { status: WorkflowRunStatus; duration: number }> {
  const logSequence = extractLogNodeSequence(logs);
  const resultByRunId = new Map(nodeResults.map((nr) => [nr.nodeId, nr]));
  const resultMap = new Map<string, { status: WorkflowRunStatus; duration: number }>();
  const usedRunIds = new Set<string>();

  const runIdToName = (runId: string): string => {
    return resolveNodeMeta(runId, nameLookup, logSequence).name;
  };

  for (const workflowNode of workflowNodes) {
    const direct = resultByRunId.get(workflowNode.id);
    if (direct) {
      resultMap.set(workflowNode.id, direct);
      usedRunIds.add(workflowNode.id);
      continue;
    }

    const match = nodeResults.find(
      (nr) => !usedRunIds.has(nr.nodeId) && runIdToName(nr.nodeId) === workflowNode.name,
    );
    if (match) {
      resultMap.set(workflowNode.id, match);
      usedRunIds.add(match.nodeId);
    }
  }

  return resultMap;
}

function sortNodesByLayout(nodes: WorkflowSnapshotNode[]): WorkflowSnapshotNode[] {
  return [...nodes].sort((a, b) => {
    if (a.positionX !== b.positionX) return a.positionX - b.positionX;
    return a.positionY - b.positionY;
  });
}

function pickNextEdge(
  edges: WorkflowSnapshot['edges'],
  sourceId: string,
): WorkflowSnapshot['edges'][number] | undefined {
  const outbound = edges.filter((e) => e.sourceId === sourceId);
  if (!outbound.length) return undefined;
  return (
    outbound.find((e) => e.label === 'true')
    ?? outbound.find((e) => !e.label)
    ?? outbound.find((e) => e.label !== 'false')
    ?? outbound[0]
  );
}

function findEntryNode(
  nodes: WorkflowSnapshotNode[],
  edges: WorkflowSnapshot['edges'],
): WorkflowSnapshotNode | undefined {
  const targets = new Set(edges.map((e) => e.targetId));
  const roots = nodes.filter((n) => !targets.has(n.id));
  const trigger = roots.find((n) => isTriggerNode(n));
  if (trigger) return trigger;
  if (roots.length) return sortNodesByLayout(roots)[0];
  return sortNodesByLayout(nodes)[0];
}

function nodesBeforePipeline(
  nodes: WorkflowSnapshotNode[],
  pipelineStart: WorkflowSnapshotNode,
  aggregate?: WorkflowSnapshotNode,
): WorkflowSnapshotNode[] {
  const maxX = aggregate?.positionX ?? pipelineStart.positionX;
  return sortNodesByLayout(
    nodes.filter((n) => {
      if (n.id === pipelineStart.id) return false;
      if (isAggregateNode(n) || isFanInMeta({ name: n.name, type: n.type })) return false;
      if (n.positionX < pipelineStart.positionX) return true;
      if (aggregate && n.positionX >= aggregate.positionX) return false;
      return false;
    }),
  );
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
    const edge = pickNextEdge(edges, currentId);
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

function isTriggerNode(node: Pick<WorkflowSnapshotNode, 'type'>): boolean {
  return ['schedule', 'trigger', 'webhook'].includes(node.type);
}

export function resolveTriggerNodeDisplayName(
  node: Pick<WorkflowSnapshotNode, 'type' | 'name'>,
  triggerType?: string,
): string {
  if (!isTriggerNode(node)) return node.name;
  const effective = effectiveTriggerType(triggerType);
  if (effective === 'schedule') return node.name;
  if (effective === 'manual') return 'Manual Trigger';
  if (effective === 'retry') return 'Retry Failed Jobs';
  return node.name;
}

function resolveNodeStatus(
  exec: NodeExecution | undefined,
  result: { status: WorkflowRunStatus; duration: number } | undefined,
  options: {
    workflowNodeId: string;
    currentNodeId?: string;
    runStatus?: WorkflowRunStatus;
  },
): WorkflowRunStatus | 'pending' {
  if (exec?.status) return exec.status;
  if (result?.status) return result.status;
  if (
    options.runStatus === 'running'
    && options.currentNodeId
    && options.currentNodeId === options.workflowNodeId
  ) {
    return 'running';
  }
  return 'pending';
}

function latestCommonExecution(
  nodeExecutions: NodeExecution[],
  workflowNodeId: string,
): NodeExecution | undefined {
  return nodeExecutions
    .filter((n) => n.workflowNodeId === workflowNodeId && !n.jobExecutionId)
    .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0];
}

function toGraphNode(
  template: WorkflowSnapshotNode,
  exec: NodeExecution | undefined,
  scope: { jobIndex?: number; attempt?: number; jobExecutionId?: string },
  result: { status: WorkflowRunStatus; duration: number } | undefined,
  triggerType: string,
  runMeta: { currentNodeId?: string; runStatus?: WorkflowRunStatus },
): GraphNodeView {
  return {
    key: `${template.id}-${scope.jobIndex ?? 'common'}-${scope.attempt ?? 1}`,
    workflowNodeId: template.id,
    name: resolveTriggerNodeDisplayName(template, triggerType),
    type: template.type,
    status: resolveNodeStatus(exec, result, {
      workflowNodeId: template.id,
      currentNodeId: runMeta.currentNodeId,
      runStatus: runMeta.runStatus,
    }),
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
  triggerType?: string;
  run: Pick<
    WorkflowRun,
    | 'nodeResults'
    | 'jobsTotal'
    | 'jobsSuccessful'
    | 'jobsFailed'
    | 'jobsSkipped'
    | 'currentNodeId'
    | 'status'
  >;
}): ExecutionGraphView {
  const triggerType = effectiveTriggerType(input.triggerType);
  const latestJobs = latestJobAttempts(input.jobExecutions);
  const jobsTotal = input.run.jobsTotal ?? latestJobs.length;
  const jobsSuccessful = input.run.jobsSuccessful ?? latestJobs.filter((j) => j.status === 'success').length;
  const jobsFailed = input.run.jobsFailed ?? latestJobs.filter((j) => j.status === 'failed').length;
  const jobsSkipped = input.run.jobsSkipped ?? latestJobs.filter((j) => j.status === 'skipped').length;
  const usedPersistedSnapshot = Boolean(input.snapshot?.nodes?.length);
  const isLegacy = !usedPersistedSnapshot;
  const runMeta = { currentNodeId: input.run.currentNodeId, runStatus: input.run.status };

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
    return buildLegacyGraph(
      input.run,
      latestJobs,
      input.nodeExecutions,
      nameLookup,
      triggerType,
      input.logs,
      input.workflowNodes,
      {
        jobsTotal,
        jobsSuccessful,
        jobsFailed,
        jobsSkipped,
      },
    );
  }

  const nodes = snapshot.nodes;
  const edges = snapshot.edges || [];
  const resultMap = mapResultsToWorkflowIds(
    input.run.nodeResults,
    nodes,
    nameLookup,
    input.logs,
  );
  const pipelineStart = findPipelineStartNode(nodes);
  const aggregate = findAggregateNode(nodes);

  const commonNodes: GraphNodeView[] = [];
  if (pipelineStart) {
    const prefixNodes = nodesBeforePipeline(nodes, pipelineStart, aggregate);
    for (const node of prefixNodes) {
      const exec = latestCommonExecution(input.nodeExecutions, node.id);
      commonNodes.push(
        toGraphNode(node, exec, {}, resultMap.get(node.id), triggerType, runMeta),
      );
    }
  } else {
    const entry = findEntryNode(nodes, edges);
    const chain = entry ? buildChainFrom(entry.id, nodes, edges) : sortNodesByLayout(nodes);
    for (const node of chain.filter((n) => !isAggregateNode(n))) {
      const exec = latestCommonExecution(input.nodeExecutions, node.id);
      commonNodes.push(
        toGraphNode(node, exec, {}, resultMap.get(node.id), triggerType, runMeta),
      );
    }
  }

  const jobChain = pipelineStart ? buildChainFrom(pipelineStart.id, nodes, edges) : [];
  const fanInNodes: GraphNodeView[] = [];
  if (aggregate) {
    const tail = buildChainFrom(aggregate.id, nodes, edges, false);
    for (const node of tail) {
      const exec = latestCommonExecution(input.nodeExecutions, node.id);
      fanInNodes.push(
        toGraphNode(node, exec, {}, resultMap.get(node.id), triggerType, runMeta),
      );
    }
  } else {
    const fanInTemplates = sortNodesByLayout(
      nodes.filter((n) => isFanInMeta({ name: n.name, type: n.type })),
    );
    for (const node of fanInTemplates) {
      const exec = latestCommonExecution(input.nodeExecutions, node.id);
      fanInNodes.push(
        toGraphNode(node, exec, {}, resultMap.get(node.id), triggerType, runMeta),
      );
    }
  }

  const jobBranches: JobBranchView[] = latestJobs.map((job) => {
    const jobNodeExecs = input.nodeExecutions.filter((n) => n.jobExecutionId === job.id);
    const branchNodes = jobChain.map((template) => {
      const exec = jobNodeExecs
        .filter((n) => n.workflowNodeId === template.id && n.attempt === job.attempt)
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())[0]
        || jobNodeExecs.find((n) => n.workflowNodeId === template.id);
      return toGraphNode(
        template,
        exec,
        {
          jobIndex: job.jobIndex,
          attempt: job.attempt,
          jobExecutionId: job.id,
        },
        resultMap.get(template.id),
        triggerType,
        runMeta,
      );
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
  run: Pick<WorkflowRun, 'nodeResults' | 'currentNodeId' | 'status'>,
  jobs: JobExecution[],
  nodeExecutions: NodeExecution[],
  nameLookup: Map<string, { name: string; type?: string; positionX?: number; positionY?: number }>,
  triggerType: string,
  logs: WorkflowRun['logs'] | undefined,
  workflowNodes: WorkflowNodeRef[] | undefined,
  counters: { jobsTotal: number; jobsSuccessful: number; jobsFailed: number; jobsSkipped: number },
): ExecutionGraphView {
  const logSequence = extractLogNodeSequence(logs);
  const logOrder = new Map<string, number>();
  logSequence.forEach((entry, index) => {
    if (entry.nodeId) logOrder.set(entry.nodeId, index);
  });

  const jobNodeIds = new Set(
    nodeExecutions
      .filter((exec) => exec.jobExecutionId)
      .map((exec) => exec.workflowNodeId),
  );

  const resultById = new Map(run.nodeResults.map((nr) => [nr.nodeId, nr]));
  const orderedNodeIds = logSequence.length
    ? [
      ...logSequence.map((entry) => entry.nodeId).filter((id): id is string => Boolean(id)),
      ...run.nodeResults
        .map((nr) => nr.nodeId)
        .filter((id) => !logOrder.has(id)),
    ]
    : [...run.nodeResults]
      .sort((a, b) => {
        const posA = resolveNodeMeta(a.nodeId, nameLookup, logSequence, workflowNodes).positionX
          ?? Number.MAX_SAFE_INTEGER;
        const posB = resolveNodeMeta(b.nodeId, nameLookup, logSequence, workflowNodes).positionX
          ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        const yA = resolveNodeMeta(a.nodeId, nameLookup, logSequence, workflowNodes).positionY ?? 0;
        const yB = resolveNodeMeta(b.nodeId, nameLookup, logSequence, workflowNodes).positionY ?? 0;
        return yA - yB;
      })
      .map((nr) => nr.nodeId);

  const toLegacyGraphNode = (nodeId: string): GraphNodeView => {
    const nr = resultById.get(nodeId);
    const meta = resolveNodeMeta(nodeId, nameLookup, logSequence, workflowNodes);
    const type = meta.type || 'legacy';
    return {
      key: `legacy-${nodeId}`,
      workflowNodeId: nodeId,
      name: resolveTriggerNodeDisplayName({ type, name: meta.name }, triggerType),
      type,
      status: nr?.status
        ?? (run.status === 'running' && run.currentNodeId === nodeId ? 'running' : 'pending'),
      durationMs: nr?.duration,
    };
  };

  const seen = new Set<string>();
  const commonNodes: GraphNodeView[] = [];
  const fanInNodes: GraphNodeView[] = [];

  for (const nodeId of orderedNodeIds) {
    if (seen.has(nodeId) || jobNodeIds.has(nodeId)) continue;
    seen.add(nodeId);
    const meta = resolveNodeMeta(nodeId, nameLookup, logSequence, workflowNodes);
    const graphNode = toLegacyGraphNode(nodeId);
    if (isFanInMeta(meta)) {
      fanInNodes.push(graphNode);
    } else {
      commonNodes.push(graphNode);
    }
  }

  const sortByLayout = (a: GraphNodeView, b: GraphNodeView) => (
    compareGraphNodesByLayout(a, b, nameLookup, logSequence, workflowNodes, logOrder)
  );

  commonNodes.sort(sortByLayout);
  fanInNodes.sort(sortByLayout);

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
        name: exec.nodeName || resolveNodeMeta(exec.workflowNodeId, nameLookup, logSequence, workflowNodes).name,
        type: exec.nodeType || resolveNodeMeta(exec.workflowNodeId, nameLookup, logSequence, workflowNodes).type || 'legacy',
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
      }))
      .sort((a, b) => compareGraphNodesByLayout(
        { workflowNodeId: a.workflowNodeId, name: a.name },
        { workflowNodeId: b.workflowNodeId, name: b.name },
        nameLookup,
        logSequence,
        workflowNodes,
        logOrder,
      )),
  }));

  return {
    commonNodes,
    jobBranches,
    fanInNodes,
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
