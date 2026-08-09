import type { WorkflowEdgeRow, WorkflowNodeRow } from './types.ts';

export function getEntryNodes(nodes: WorkflowNodeRow[], edges: WorkflowEdgeRow[]): WorkflowNodeRow[] {
  const targets = new Set(edges.map((e) => e.target_id));
  const triggers = nodes.filter((n) =>
    ['schedule', 'trigger', 'webhook'].includes(n.type) || !targets.has(n.id)
  );
  if (triggers.length) return triggers;
  return nodes.filter((n) => !targets.has(n.id));
}

export function getOutgoingEdges(nodeId: string, edges: WorkflowEdgeRow[]): WorkflowEdgeRow[] {
  return edges.filter((e) => e.source_id === nodeId);
}

export function getNextNodeId(
  nodeId: string,
  edges: WorkflowEdgeRow[],
  route?: string,
): string | null {
  const outgoing = getOutgoingEdges(nodeId, edges);
  if (!outgoing.length) return null;
  if (route) {
    const labeled = outgoing.find((e) => e.label === route);
    if (labeled) return labeled.target_id;
    if (route === 'true') {
      const t = outgoing.find((e) => e.label === 'true' || !e.label);
      if (t) return t.target_id;
    }
    if (route === 'false') {
      const f = outgoing.find((e) => e.label === 'false');
      if (f) return f.target_id;
    }
  }
  return outgoing[0].target_id;
}

export function topologicalSort(nodes: WorkflowNodeRow[], edges: WorkflowEdgeRow[]): WorkflowNodeRow[] {
  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    inDegree.set(e.target_id, (inDegree.get(e.target_id) ?? 0) + 1);
  }
  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
  const sorted: WorkflowNodeRow[] = [];
  const visited = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    sorted.push(node);
    for (const e of edges.filter((x) => x.source_id === node.id)) {
      const deg = (inDegree.get(e.target_id) ?? 1) - 1;
      inDegree.set(e.target_id, deg);
      if (deg === 0) {
        const target = nodes.find((n) => n.id === e.target_id);
        if (target) queue.push(target);
      }
    }
  }
  return sorted.length ? sorted : nodes;
}

export function resolveTemplate(str: string, ctx: { variables: Record<string, unknown>; nodeOutputs: Record<string, unknown>; settings: Record<string, unknown> }): string {
  return str.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split('.');
    let val: unknown = { settings: ctx.settings, variables: ctx.variables, outputs: ctx.nodeOutputs };
    for (const p of parts) {
      val = (val as Record<string, unknown>)?.[p];
    }
    return val != null ? String(val) : '';
  });
}
