import { DEFAULT_JOB_SEARCH_WORKFLOW, buildSeedEdges } from '../../../../src/constants/workflow-seed.ts';
import {
  nodeSignature,
  planPipelineRepair,
  type RepairEdgeRef,
  type RepairNodeRef,
} from '../../../../src/utils/pipeline-repair.ts';

const seedNodes = DEFAULT_JOB_SEARCH_WORKFLOW.nodes;
const seedEdges = buildSeedEdges([]);

let idSeq = 0;
const newId = () => `new-${++idSeq}`;

/** A healthy graph: every seed node present at its seed position, all edges wired. */
function healthyGraph(): { nodes: RepairNodeRef[]; edges: RepairEdgeRef[] } {
  const nodes: RepairNodeRef[] = seedNodes.map((s, i) => ({
    id: `n${i}`,
    type: s.type,
    name: s.name,
    position: { x: s.x, y: s.y },
    config: s.config,
  }));
  const edges: RepairEdgeRef[] = seedEdges.map((e, i) => ({
    id: `e${i}`,
    source: `n${e.source}`,
    target: `n${e.target}`,
    label: e.label,
  }));
  return { nodes, edges };
}

function plan(nodes: RepairNodeRef[], edges: RepairEdgeRef[]) {
  return planPipelineRepair({ seedNodes, seedEdges, nodes, edges, newId });
}

Deno.test('a healthy graph is a no-op (repair is idempotent)', () => {
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

Deno.test('every seed node has a unique type+config signature', () => {
  // The whole matcher depends on this; if a future seed breaks it, fail loudly here
  // rather than silently mismatching two nodes in production.
  const seen = new Map<string, string>();
  for (const s of seedNodes) {
    const sig = nodeSignature(s.type, s.config);
    const prev = seen.get(sig);
    if (prev) throw new Error(`duplicate signature "${sig}": ${prev} and ${s.name}`);
    seen.set(sig, s.name);
  }
});

Deno.test('an edge-less graph is fully rewired (the 23505/57014 aftermath)', () => {
  const { nodes } = healthyGraph();
  const result = plan(nodes, []);
  if (result.insertNodes.length) {
    throw new Error(`should not re-create existing nodes, got ${result.insertNodes.length}`);
  }
  if (result.deleteEdgeIds.length) throw new Error('nothing to delete when there are no edges');
  if (result.insertEdges.length !== seedEdges.length) {
    throw new Error(`expected ${seedEdges.length} edges restored, got ${result.insertEdges.length}`);
  }
  // Every restored edge must point at real, existing node ids.
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of result.insertEdges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      throw new Error(`restored edge references unknown node: ${e.source}->${e.target}`);
    }
  }
});

Deno.test('after repair no node has two unlabelled outgoing edges (no accidental fork)', () => {
  const { nodes } = healthyGraph();
  const result = plan(nodes, []);
  const counts = new Map<string, number>();
  for (const e of result.insertEdges) {
    if (e.label) continue; // labelled branches are the intentional fork
    counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
  }
  for (const [source, count] of counts) {
    if (count > 1) throw new Error(`node ${source} has ${count} unlabelled outgoing edges`);
  }
});

Deno.test('legacy "Get Resume" name is matched by type, not renamed or duplicated', () => {
  // Older seeds named the gdocs step "Get Resume"; matching on name alone would
  // miss it and leave edges 0->1 and 1->2 permanently absent.
  const { nodes, edges } = healthyGraph();
  const gdocsIndex = seedNodes.findIndex((s) => s.type === 'gdocs');
  if (gdocsIndex < 0) throw new Error('seed has no gdocs node');
  nodes[gdocsIndex] = { ...nodes[gdocsIndex], name: 'Get Resume' };

  const result = plan(nodes, edges);
  if (result.insertNodes.length) {
    throw new Error('renamed node must be matched, not re-created');
  }
  if (!result.isNoop) {
    throw new Error('a graph that differs only by node name needs no writes');
  }
  if (result.resolvedIds[gdocsIndex] !== nodes[gdocsIndex].id) {
    throw new Error('gdocs node resolved to the wrong id');
  }
});

Deno.test('a missing node is created and its edges wired', () => {
  const { nodes, edges } = healthyGraph();
  const matchIndex = seedNodes.findIndex((s) => s.config.action === 'match_score');
  if (matchIndex < 0) throw new Error('seed has no Match Score node');
  const removed = nodes[matchIndex];
  const remaining = nodes.filter((n) => n.id !== removed.id);
  const remainingEdges = edges.filter((e) => e.source !== removed.id && e.target !== removed.id);

  const result = plan(remaining, remainingEdges);
  if (result.insertNodes.length !== 1) {
    throw new Error(`expected 1 node created, got ${result.insertNodes.length}`);
  }
  const created = result.insertNodes[0];
  if (created.name !== 'Match Score') throw new Error(`created wrong node: ${created.name}`);

  const newNodeId = result.resolvedIds[matchIndex];
  const touching = result.insertEdges.filter((e) => e.source === newNodeId || e.target === newNodeId);
  if (touching.length !== 2) {
    throw new Error(`expected the new node wired in/out, got ${touching.length} edges`);
  }
});

Deno.test('a stale chain edge from an older node order is removed', () => {
  const { nodes, edges } = healthyGraph();
  const atsIndex = seedNodes.findIndex((s) => s.type === 'gemini');
  const latexIndex = seedNodes.findIndex((s) => s.config.builtin === 'build_latex');
  // Simulate the pre-Match-Score order, where ATS pointed straight at Build LaTeX.
  const stale: RepairEdgeRef = {
    id: 'stale-1',
    source: `n${atsIndex}`,
    target: `n${latexIndex}`,
  };

  const result = plan(nodes, [...edges, stale]);
  if (!result.deleteEdgeIds.includes('stale-1')) {
    throw new Error('stale ats->latex edge should be deleted');
  }
  if (result.insertEdges.length) throw new Error('nothing missing, so nothing to insert');
});

Deno.test('a drifted node position is realigned to the seed', () => {
  const { nodes, edges } = healthyGraph();
  const matchIndex = seedNodes.findIndex((s) => s.config.action === 'match_score');
  // An older repair placed Match Score before Store Job; positionX drives the
  // shared-prefix / per-job / fan-in split in the execution graph.
  nodes[matchIndex] = { ...nodes[matchIndex], position: { x: 1700, y: 200 } };

  const result = plan(nodes, edges);
  const move = result.updatePositions.find((u) => u.id === nodes[matchIndex].id);
  if (!move) throw new Error('drifted node should be repositioned');
  if (move.x !== seedNodes[matchIndex].x) {
    throw new Error(`expected x=${seedNodes[matchIndex].x}, got ${move.x}`);
  }
});

Deno.test('user-added nodes and their edges are left untouched', () => {
  const { nodes, edges } = healthyGraph();
  const custom: RepairNodeRef = {
    id: 'custom-1',
    type: 'email',
    name: 'My Extra Alert',
    position: { x: 4000, y: 600 },
    config: {},
  };
  const customEdge: RepairEdgeRef = { id: 'custom-e', source: 'n0', target: 'custom-1' };

  const result = plan([...nodes, custom], [...edges, customEdge]);
  if (result.deleteEdgeIds.includes('custom-e')) {
    throw new Error('edges touching user nodes must never be deleted');
  }
  if (result.updatePositions.some((u) => u.id === 'custom-1')) {
    throw new Error('user node must not be repositioned');
  }
  if (!result.isNoop) throw new Error('a healthy graph plus user extras needs no writes');
});

Deno.test('an empty graph is rebuilt from scratch', () => {
  const result = plan([], []);
  if (result.insertNodes.length !== seedNodes.length) {
    throw new Error(`expected ${seedNodes.length} nodes, got ${result.insertNodes.length}`);
  }
  if (result.insertEdges.length !== seedEdges.length) {
    throw new Error(`expected ${seedEdges.length} edges, got ${result.insertEdges.length}`);
  }
});

/**
 * The reported production graph: provisioned from the Aug-22 seed (`4f3363e7`) and
 * never migrated, then left edge-less by the half-applied `saveGraph`.
 *
 * 19 nodes in the old order (Limit → Dedupe → ATS → Store), with two steps the
 * current seed no longer has: `Get Resume` (gdocs, later renamed) and
 * `Upload to Drive` (gdrive, retired in 5d682c32). No `Match Score`.
 */
function legacyAug22Graph(): RepairNodeRef[] {
  const defs: [string, string, number, Record<string, unknown>][] = [
    ['schedule', 'Daily 7 AM', 0, { cron: '0 7 * * *' }],
    ['gdocs', 'Get Resume', 200, { fileId: '{{settings.jobSearch.resumeFileId}}' }],
    ['transform', 'Build LinkedIn URL', 400, { action: 'build_linkedin_url' }],
    ['apify', 'Start Apify Scrape', 600, { action: 'start_run', count: 10 }],
    ['apify', 'Check Apify Status', 800, { action: 'check_status' }],
    ['wait', 'Wait 10s', 800, { seconds: 10 }],
    ['apify', 'Fetch Results', 1000, { action: 'fetch_dataset' }],
    ['function', 'Parse Jobs', 1200, { builtin: 'parse_apify_jobs' }],
    ['transform', 'Limit Jobs', 1400, { action: 'limit', max: 5 }],
    ['duplicate_checker', 'Filter Duplicates', 1600, {}],
    ['gemini', 'ATS Optimizer', 1800, {}],
    ['supabase', 'Store Job', 2000, { action: 'insert_job' }],
    ['function', 'Build LaTeX', 2200, { builtin: 'build_latex' }],
    ['pdf', 'Compile PDF', 2400, {}],
    ['storage', 'Upload to Storage', 2600, {}],
    ['gdrive', 'Upload to Drive', 2800, { action: 'upload' }],
    ['function', 'Email Summary', 3000, { builtin: 'email_summary' }],
    ['email', 'Send Email', 3200, {}],
  ];
  return defs.map(([type, name, x, config], i) => ({
    id: `legacy-${i}`,
    type,
    name,
    position: { x, y: name === 'Wait 10s' ? 400 : 200 },
    config,
  }));
}

Deno.test('legacy Aug-22 graph with no edges is fully migrated in one pass', () => {
  const nodes = legacyAug22Graph();
  const result = plan(nodes, []);

  // The retired gdrive node must be deleted, not left orphaned: an orphan has no
  // incoming edge, so getEntryNodes() would run it as a stray start node.
  const drive = nodes.find((n) => n.name === 'Upload to Drive')!;
  if (!result.deleteNodeIds.includes(drive.id)) {
    throw new Error('retired Upload to Drive node must be deleted');
  }
  // Match Score is the only genuinely new step.
  if (result.insertNodes.length !== 1 || result.insertNodes[0].name !== 'Match Score') {
    throw new Error(
      `expected only Match Score created, got ${result.insertNodes.map((n) => n.name).join(', ')}`,
    );
  }
  // "Get Resume" must be reused, never duplicated.
  const gdocsIndex = seedNodes.findIndex((s) => s.type === 'gdocs');
  if (result.resolvedIds[gdocsIndex] !== nodes[1].id) {
    throw new Error('legacy "Get Resume" node should have been reused');
  }
  // The retired node must not appear anywhere in the rewired chain.
  for (const e of result.insertEdges) {
    if (e.source === drive.id || e.target === drive.id) {
      throw new Error('deleted node must not be wired into the chain');
    }
  }
  if (result.insertEdges.length !== seedEdges.length) {
    throw new Error(`expected ${seedEdges.length} edges, got ${result.insertEdges.length}`);
  }
});

Deno.test('legacy Aug-22 graph WITH its old edges is rewired to the new order', () => {
  const nodes = legacyAug22Graph();
  // Old linear chain 0..17 exactly as the Aug-22 buildSeedEdges defined it.
  const oldEdges: RepairEdgeRef[] = [
    { id: 'o0', source: 'legacy-0', target: 'legacy-1' },
    { id: 'o1', source: 'legacy-1', target: 'legacy-2' },
    { id: 'o2', source: 'legacy-2', target: 'legacy-3' },
    { id: 'o3', source: 'legacy-3', target: 'legacy-4' },
    { id: 'o4', source: 'legacy-4', target: 'legacy-5', label: 'false' },
    { id: 'o5', source: 'legacy-5', target: 'legacy-4' },
    { id: 'o6', source: 'legacy-4', target: 'legacy-6', label: 'true' },
    { id: 'o7', source: 'legacy-6', target: 'legacy-7' },
    { id: 'o8', source: 'legacy-7', target: 'legacy-8' },
    { id: 'o9', source: 'legacy-8', target: 'legacy-9' },
    { id: 'o10', source: 'legacy-9', target: 'legacy-10' },
    { id: 'o11', source: 'legacy-10', target: 'legacy-11' },
    { id: 'o12', source: 'legacy-11', target: 'legacy-12' },
    { id: 'o13', source: 'legacy-12', target: 'legacy-13' },
    { id: 'o14', source: 'legacy-13', target: 'legacy-14' },
    { id: 'o15', source: 'legacy-14', target: 'legacy-15' },
    { id: 'o16', source: 'legacy-15', target: 'legacy-16' },
    { id: 'o17', source: 'legacy-16', target: 'legacy-17' },
  ];
  const result = plan(nodes, oldEdges);

  // Both edges touching the retired gdrive node must be removed.
  for (const id of ['o15', 'o16']) {
    if (!result.deleteEdgeIds.includes(id)) {
      throw new Error(`edge ${id} touches the retired Drive node and must be deleted`);
    }
  }
  // The old ATS→Store order must be replaced by Store→ATS→Match.
  const atsId = nodes[10].id;
  const storeId = nodes[11].id;
  const matchIndex = seedNodes.findIndex((s) => s.config.action === 'match_score');
  const matchId = result.resolvedIds[matchIndex];
  const has = (source: string, target: string) =>
    result.insertEdges.some((e) => e.source === source && e.target === target);
  if (!has(storeId, atsId)) throw new Error('expected Store Job → ATS Optimizer');
  if (!has(atsId, matchId)) throw new Error('expected ATS Optimizer → Match Score');
  if (!result.deleteEdgeIds.includes('o10')) {
    throw new Error('stale Filter Duplicates → ATS edge must be deleted');
  }
  if (!result.deleteEdgeIds.includes('o11')) {
    throw new Error('stale ATS → Store Job edge must be deleted');
  }
});

Deno.test('migrating the legacy graph converges after one pass', () => {
  // Guards against a repair that rewrites the same rows on every job search —
  // the behaviour that produced the 23505 / 57014 failures.
  const nodes = legacyAug22Graph();
  const first = plan(nodes, []);

  const deletedNodes = new Set(first.deleteNodeIds);
  const applied: RepairNodeRef[] = nodes
    .filter((n) => !deletedNodes.has(n.id))
    .map((n) => {
      const move = first.updatePositions.find((u) => u.id === n.id);
      return move ? { ...n, position: { x: move.x, y: move.y } } : n;
    });
  for (const created of first.insertNodes) {
    applied.push({
      id: created.id,
      type: created.type,
      name: created.name,
      position: { x: created.x, y: created.y },
      config: created.config,
    });
  }
  const appliedEdges: RepairEdgeRef[] = first.insertEdges.map((e, i) => ({
    id: `applied-${i}`,
    source: e.source,
    target: e.target,
    label: e.label ?? undefined,
  }));

  const second = plan(applied, appliedEdges);
  if (!second.isNoop) {
    throw new Error(
      `second pass must be a no-op, got +${second.insertNodes.length}n ` +
      `-${second.deleteNodeIds.length}n ${second.updatePositions.length}mv ` +
      `-${second.deleteEdgeIds.length}e +${second.insertEdges.length}e`,
    );
  }
});

Deno.test('every seed node is reachable from the trigger after migration', () => {
  // The real regression test for the reported symptom: if any seed node is
  // unreachable it has no incoming edge, and getEntryNodes() would run it as a
  // stray start node — which is what produced the scrambled execution order.
  const nodes = legacyAug22Graph();
  const result = plan(nodes, []);
  const deletedNodes = new Set(result.deleteNodeIds);
  const live = new Set(result.resolvedIds);

  const adjacency = new Map<string, string[]>();
  for (const e of result.insertEdges) {
    if (deletedNodes.has(e.source) || deletedNodes.has(e.target)) continue;
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  }
  const triggerIndex = seedNodes.findIndex((s) => s.type === 'schedule');
  const start = result.resolvedIds[triggerIndex];

  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  for (const [i, id] of result.resolvedIds.entries()) {
    if (!live.has(id)) continue;
    if (!seen.has(id)) throw new Error(`seed node "${seedNodes[i].name}" is unreachable`);
  }
  if (seen.size !== seedNodes.length) {
    throw new Error(`reached ${seen.size} of ${seedNodes.length} nodes`);
  }
});

Deno.test('a user-added gdrive node is NOT deleted when it is not an upload step', () => {
  // Only the retired `gdrive#action:upload` signature is ever removed.
  const { nodes, edges } = healthyGraph();
  const custom: RepairNodeRef = {
    id: 'custom-gdrive',
    type: 'gdrive',
    name: 'Download Template',
    position: { x: 4000, y: 600 },
    config: { action: 'download' },
  };
  const result = plan([...nodes, custom], edges);
  if (result.deleteNodeIds.includes('custom-gdrive')) {
    throw new Error('a non-retired gdrive node must be preserved');
  }
});

/**
 * The user-visible goal: the Executions page must render a shared prefix, a per-job
 * fan-out containing Match Score, and a fan-in.
 *
 * `src/utils/execution-graph.ts` can't be imported here (it uses `@/` path aliases
 * that Deno won't resolve), so this mirrors the three rules it applies to the graph
 * topology, which is what actually decides the rendering:
 *   - pipeline start  = the `supabase` node with `action: insert_job`  (Store Job)
 *   - aggregate/fan-in = the `function` node with `builtin: email_summary`
 *   - the per-job branch = follow edges from the pipeline start, stop at aggregate
 */
Deno.test('after migration the per-job fan-out contains Match Score after ATS Optimizer', () => {
  const nodes = legacyAug22Graph();
  const result = plan(nodes, []);
  const idFor = (predicate: (s: typeof seedNodes[number]) => boolean) =>
    result.resolvedIds[seedNodes.findIndex(predicate)];

  const storeId = idFor((s) => s.type === 'supabase' && s.config.action === 'insert_job');
  const aggregateId = idFor((s) => s.type === 'function' && s.config.builtin === 'email_summary');
  const nameById = new Map<string, string>(
    result.resolvedIds.map((id, i) => [id, seedNodes[i].name]),
  );

  // Mirror `pickNextEdge`: prefer the 'true' branch, then unlabelled.
  const nextFrom = (id: string): string | undefined => {
    const out = result.insertEdges.filter((e) => e.source === id);
    return (out.find((e) => e.label === 'true') ?? out.find((e) => !e.label) ?? out[0])?.target;
  };

  const branch: string[] = [];
  let cursor: string | undefined = storeId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor) && cursor !== aggregateId) {
    seen.add(cursor);
    branch.push(nameById.get(cursor) ?? cursor);
    cursor = nextFrom(cursor);
  }

  const expected = [
    'Store Job',
    'ATS Optimizer',
    'Match Score',
    'Build LaTeX',
    'Compile PDF',
    'Upload to Storage',
  ];
  if (branch.join(' → ') !== expected.join(' → ')) {
    throw new Error(`fan-out chain wrong.\n  expected: ${expected.join(' → ')}\n  actual:   ${branch.join(' → ')}`);
  }
  // The branch must terminate at the fan-in, otherwise Email Summary / Send Email
  // would never render as fan-in nodes.
  if (cursor !== aggregateId) {
    throw new Error('per-job branch must lead into Email Summary (the fan-in)');
  }
  // And the retired Drive step must not be in the branch.
  if (branch.includes('Upload to Drive')) {
    throw new Error('retired Upload to Drive must not appear in the fan-out');
  }
});

Deno.test('after migration the shared prefix and fan-in are correctly separated', () => {
  // positionX drives the split in execution-graph.ts: everything left of Store Job
  // is the shared prefix; Email Summary onward is the fan-in.
  const nodes = legacyAug22Graph();
  const result = plan(nodes, []);

  const finalX = new Map<string, number>();
  result.resolvedIds.forEach((id, i) => finalX.set(id, seedNodes[i].x));

  const storeIndex = seedNodes.findIndex((s) => s.type === 'supabase' && s.config.action === 'insert_job');
  const aggIndex = seedNodes.findIndex((s) => s.type === 'function' && s.config.builtin === 'email_summary');
  const storeX = seedNodes[storeIndex].x;
  const aggX = seedNodes[aggIndex].x;

  const prefix = seedNodes.filter((s) => s.x < storeX).map((s) => s.name);
  for (const required of ['Daily 7 AM', 'Sync Google Doc Resume', 'Filter Duplicates', 'Limit Jobs']) {
    if (!prefix.includes(required)) throw new Error(`"${required}" should be in the shared prefix`);
  }
  // Match Score must NOT be in the shared prefix — it belongs to the per-job branch.
  if (prefix.includes('Match Score')) {
    throw new Error('Match Score must sit inside the fan-out, not the shared prefix');
  }
  // ATS Optimizer likewise (it used to be at x=1800, before Store Job, which is why
  // the old graph showed it in both the prefix and the branch).
  if (prefix.includes('ATS Optimizer')) {
    throw new Error('ATS Optimizer must sit inside the fan-out, not the shared prefix');
  }
  const matchX = seedNodes.find((s) => s.config.action === 'match_score')!.x;
  if (!(matchX > storeX && matchX < aggX)) {
    throw new Error(`Match Score x=${matchX} must fall between Store Job (${storeX}) and Email Summary (${aggX})`);
  }
  if (finalX.size !== seedNodes.length) throw new Error('every seed node needs a resolved position');
});

Deno.test('repair converges: applying the plan twice yields a no-op', () => {
  // Start from the broken state in the reported screenshot: nodes present, no edges.
  const { nodes } = healthyGraph();
  const first = plan(nodes, []);

  const appliedEdges: RepairEdgeRef[] = first.insertEdges.map((e, i) => ({
    id: `applied-${i}`,
    source: e.source,
    target: e.target,
    label: e.label ?? undefined,
  }));
  const appliedNodes = nodes.map((n) => {
    const move = first.updatePositions.find((u) => u.id === n.id);
    return move ? { ...n, position: { x: move.x, y: move.y } } : n;
  });

  const second = plan(appliedNodes, appliedEdges);
  if (!second.isNoop) {
    throw new Error(
      `second pass should be a no-op, got +${second.insertNodes.length} nodes, ` +
      `-${second.deleteEdgeIds.length} edges, +${second.insertEdges.length} edges`,
    );
  }
});
