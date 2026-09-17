import { DEFAULT_RESUME_TAILOR_WORKFLOW, buildTailorSeedEdges } from '../../../../src/constants/workflow-seed.ts';
import {
  nodeSignature,
  planPipelineRepair,
  type RepairEdgeRef,
  type RepairNodeRef,
} from '../../../../src/utils/pipeline-repair.ts';

/**
 * Regression tests for the built-in `Resume Tailoring` graph repair.
 *
 * `repairTailorPipelineGraph` used to gate on the *target* shape ("are all four node names
 * present?") and, on a miss, call `provisionTailorGraph` -> `saveGraph()` — a destructive
 * delete-all/insert-all rewrite. That is the BUG-003 pattern: latent while the seed is stable,
 * detonating the moment a node is renamed. These tests pin the delta-based behavior.
 */

const seedNodes = DEFAULT_RESUME_TAILOR_WORKFLOW.nodes;
const seedEdges = buildTailorSeedEdges();

let idSeq = 0;
const newId = () => `tailor-new-${++idSeq}`;

function healthyGraph(): { nodes: RepairNodeRef[]; edges: RepairEdgeRef[] } {
  const nodes: RepairNodeRef[] = seedNodes.map((s, i) => ({
    id: `t${i}`,
    type: s.type,
    name: s.name,
    position: { x: s.x, y: s.y },
    config: s.config,
  }));
  const edges: RepairEdgeRef[] = seedEdges.map((e, i) => ({
    id: `te${i}`,
    source: `t${e.source}`,
    target: `t${e.target}`,
    label: null,
  }));
  return { nodes, edges };
}

function plan(nodes: RepairNodeRef[], edges: RepairEdgeRef[]) {
  return planPipelineRepair({ seedNodes, seedEdges, nodes, edges, newId });
}

Deno.test('tailor: seed is 5 nodes and 4 edges', () => {
  if (seedNodes.length !== 5) throw new Error(`expected 5 seed nodes, got ${seedNodes.length}`);
  if (seedEdges.length !== 4) throw new Error(`expected 4 seed edges, got ${seedEdges.length}`);
});

Deno.test('tailor: every seed node has a unique type+config signature', () => {
  // Signature matching (pass 1) is what makes a rename safe. If a future seed edit breaks
  // uniqueness, fail loudly here rather than mismatching two nodes in production.
  const seen = new Map<string, string>();
  for (const s of seedNodes) {
    const sig = nodeSignature(s.type, s.config);
    const prev = seen.get(sig);
    if (prev) throw new Error(`duplicate signature "${sig}": ${prev} and ${s.name}`);
    seen.set(sig, s.name);
  }
});

Deno.test('tailor: a healthy graph is a no-op', () => {
  const { nodes, edges } = healthyGraph();
  const result = plan(nodes, edges);
  if (!result.isNoop) {
    throw new Error(
      `expected no-op, got +${result.insertNodes.length} nodes, ` +
      `${result.updatePositions.length} moves, -${result.deleteEdgeIds.length} edges, ` +
      `+${result.insertEdges.length} edges`,
    );
  }
});

Deno.test('tailor: a renamed node is matched by signature, not re-inserted', () => {
  // This is the exact case the old name-gated repair got wrong: it would see a missing
  // "ATS Optimizer" and wipe the whole graph.
  const { nodes, edges } = healthyGraph();
  const ats = nodes.find((n) => n.type === 'gemini')!;
  ats.name = 'Tailor Resume (renamed)';

  const result = plan(nodes, edges);
  if (result.insertNodes.length !== 0) {
    throw new Error(`renamed node was re-inserted: +${result.insertNodes.length} nodes`);
  }
  if (result.deleteNodeIds.length !== 0) {
    throw new Error(`renamed node was deleted: -${result.deleteNodeIds.length} nodes`);
  }
  if (!result.isNoop) {
    throw new Error('a pure rename should not change the graph topology');
  }
});

Deno.test('tailor: an edge-less graph is fully rewired without deleting nodes', () => {
  // The state a half-applied `saveGraph` leaves behind. Every node then has no incoming
  // edge, so `getEntryNodes()` runs all five as stray start nodes.
  const { nodes } = healthyGraph();
  const result = plan(nodes, []);

  if (result.insertEdges.length !== seedEdges.length) {
    throw new Error(`expected ${seedEdges.length} edge inserts, got ${result.insertEdges.length}`);
  }
  if (result.insertNodes.length !== 0) {
    throw new Error(`nodes were re-inserted: +${result.insertNodes.length}`);
  }
  if (result.deleteNodeIds.length !== 0) {
    throw new Error(`nodes were deleted: -${result.deleteNodeIds.length}`);
  }
});

Deno.test('tailor: a missing node is restored and rewired', () => {
  const { nodes, edges } = healthyGraph();
  const pdfIdx = seedNodes.findIndex((s) => s.type === 'pdf');
  const pdfId = `t${pdfIdx}`;
  const without = nodes.filter((n) => n.id !== pdfId);
  const survivingEdges = edges.filter((e) => e.source !== pdfId && e.target !== pdfId);

  const result = plan(without, survivingEdges);
  if (result.insertNodes.length !== 1) {
    throw new Error(`expected 1 node insert, got ${result.insertNodes.length}`);
  }
  if (result.insertNodes[0].type !== 'pdf') {
    throw new Error(`restored the wrong node: ${result.insertNodes[0].type}`);
  }
  // Both the edge into and out of the restored node must come back.
  if (result.insertEdges.length !== 2) {
    throw new Error(`expected 2 edge inserts, got ${result.insertEdges.length}`);
  }
});

Deno.test('tailor: every seed node is reachable from the entry node after repair', () => {
  // Direct regression test for the scrambled-order symptom: exactly one node may have no
  // incoming edge, and every other node must be reachable from it.
  const { nodes } = healthyGraph();
  const result = plan(nodes, []);

  const ids = nodes.map((n) => n.id);
  const adjacency = new Map<string, string[]>();
  for (const e of result.insertEdges) {
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  }
  const hasIncoming = new Set(result.insertEdges.map((e) => e.target));
  const entries = ids.filter((id) => !hasIncoming.has(id));
  if (entries.length !== 1) {
    throw new Error(`expected exactly 1 entry node, got ${entries.length}: ${entries.join(', ')}`);
  }

  const seen = new Set<string>([entries[0]]);
  const queue = [entries[0]];
  while (queue.length) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  const unreachable = ids.filter((id) => !seen.has(id));
  if (unreachable.length) {
    throw new Error(`unreachable nodes after repair: ${unreachable.join(', ')}`);
  }
});

Deno.test('tailor: applying the plan twice converges (no repair loop)', () => {
  // Gating on the target shape caused a permanent re-fire. Applying a plan must reach a
  // fixed point, or the repair runs destructively on every login.
  const { nodes } = healthyGraph();
  const first = plan(nodes, []);

  const merged: RepairNodeRef[] = [
    ...nodes,
    ...first.insertNodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: n.name,
      position: { x: n.x, y: n.y },
      config: n.config,
    })),
  ];
  const mergedEdges: RepairEdgeRef[] = first.insertEdges.map((e, i) => ({
    id: `merged-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
  }));

  const second = plan(merged, mergedEdges);
  if (!second.isNoop) {
    throw new Error(
      `repair did not converge: +${second.insertNodes.length} nodes, ` +
      `-${second.deleteEdgeIds.length} edges, +${second.insertEdges.length} edges`,
    );
  }
});

Deno.test('tailor: a user-added node is preserved, not deleted', () => {
  const { nodes, edges } = healthyGraph();
  nodes.push({
    id: 'user-1',
    type: 'email',
    name: 'Notify Me',
    position: { x: 1000, y: 200 },
    config: {},
  });

  const result = plan(nodes, edges);
  if (result.deleteNodeIds.includes('user-1')) {
    throw new Error('a user-added node was deleted');
  }
});

Deno.test('tailor: a stale edge between seed nodes is removed', () => {
  // A leftover shortcut gives a node two outgoing edges and forks the run.
  const { nodes, edges } = healthyGraph();
  edges.push({ id: 'stale-1', source: 't0', target: 't3', label: null });

  const result = plan(nodes, edges);
  if (!result.deleteEdgeIds.includes('stale-1')) {
    throw new Error('the stale edge was not removed');
  }
});
