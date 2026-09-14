/**
 * Pure planner for reconciling the built-in job-search pipeline graph against the
 * seed definition.
 *
 * Kept free of any Supabase or `@/` imports (the seed is passed in) so the Deno
 * test suite can import this file directly and the frontend can use it too.
 *
 * Why this exists: `saveGraph` is a destructive full-graph rewrite (delete every
 * node + edge, then re-insert). Running it as a migration was fragile — it hit the
 * statement timeout (57014) and, when the node delete failed, re-inserted the same
 * primary keys (23505) *after* the edge delete had already committed. That leaves
 * an edge-less graph, which is the worst possible state: `getEntryNodes` treats any
 * node without an incoming edge as an entry point, so every node runs as a start
 * node in arbitrary order with no data flowing between steps.
 *
 * This planner instead produces the minimal delta needed to make the graph correct,
 * and is safe to run repeatedly.
 */

export interface RepairSeedNode {
  type: string;
  name: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}

export interface RepairSeedEdge {
  source: number;
  target: number;
  label?: string;
}

export interface RepairNodeRef {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface RepairEdgeRef {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface PlannedNodeInsert {
  id: string;
  seedIndex: number;
  type: string;
  name: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
}

export interface PlannedPositionUpdate {
  id: string;
  x: number;
  y: number;
}

export interface PlannedEdgeInsert {
  source: string;
  target: string;
  label: string | null;
}

export interface PipelineRepairPlan {
  insertNodes: PlannedNodeInsert[];
  updatePositions: PlannedPositionUpdate[];
  /** Retired seed steps to remove (e.g. the old `gdrive` "Upload to Drive"). */
  deleteNodeIds: string[];
  deleteEdgeIds: string[];
  insertEdges: PlannedEdgeInsert[];
  /** Resolved node id per seed index (includes ids minted for `insertNodes`). */
  resolvedIds: string[];
  /** True when the graph already matches the seed and nothing needs writing. */
  isNoop: boolean;
}

/**
 * Signatures of steps that used to be seeded but have been retired.
 *
 * These must be deleted rather than ignored. An orphaned node has no incoming
 * edge, and `getEntryNodes()` treats every such node as an entry point — so
 * leaving one behind makes it execute as a second start node, out of order and
 * detached from the pipeline.
 *
 * Only signatures listed here are ever deleted; anything else the user added is
 * left strictly alone.
 *
 * - `gdrive#action:upload` — "Upload to Drive", removed from the seed in
 *   `5d682c32` when Drive sync became a manual, opt-in action. The `gdrive`
 *   executor still exists and self-skips unless `autoUploadDrive === true`, so a
 *   leftover node looked harmless while actually breaking graph entry detection.
 */
export const RETIRED_SEED_SIGNATURES = new Set<string>([
  'gdrive#action:upload',
]);

/**
 * A stable identity for a seed step, independent of its display name.
 *
 * Names drift across seed versions — an older seed called the gdocs step
 * "Get Resume", the current one calls it "Sync Google Doc Resume" — so matching on
 * name alone silently fails and leaves that node unlinked. `type` plus the
 * action/builtin discriminator is what the executor and the execution-graph
 * classifier key on, and it is unique for every node in the seed: the three
 * `transform`, three `apify` and three `function` nodes are each separated by their
 * `action` or `builtin`.
 */
export function nodeSignature(type: string, config: Record<string, unknown> | undefined): string {
  const action = config?.action;
  if (typeof action === 'string' && action) return `${type}#action:${action}`;
  const builtin = config?.builtin;
  if (typeof builtin === 'string' && builtin) return `${type}#builtin:${builtin}`;
  return type;
}

function edgeKey(source: string, target: string, label: string | null): string {
  return `${source}->${target}#${label ?? ''}`;
}

export function planPipelineRepair(input: {
  seedNodes: RepairSeedNode[];
  seedEdges: RepairSeedEdge[];
  nodes: RepairNodeRef[];
  edges: RepairEdgeRef[];
  newId: () => string;
  retiredSignatures?: Set<string>;
}): PipelineRepairPlan {
  const { seedNodes, seedEdges, edges, newId } = input;
  const retired = input.retiredSignatures ?? RETIRED_SEED_SIGNATURES;

  // Retired steps are removed up front so they can never be claimed as a match
  // and never appear in the rewired chain.
  const deleteNodeIds = input.nodes
    .filter((n) => retired.has(nodeSignature(n.type, n.config)))
    .map((n) => n.id);
  const deleted = new Set(deleteNodeIds);
  const nodes = input.nodes.filter((n) => !deleted.has(n.id));

  const claimed = new Set<string>();
  const resolved: (RepairNodeRef | undefined)[] = seedNodes.map(() => undefined);
  const claim = (index: number, node?: RepairNodeRef) => {
    if (!node || claimed.has(node.id)) return;
    claimed.add(node.id);
    resolved[index] = node;
  };
  const available = () => nodes.filter((n) => !claimed.has(n.id));

  // Pass 1 — type + action/builtin signature.
  seedNodes.forEach((seed, i) => {
    const want = nodeSignature(seed.type, seed.config);
    claim(i, available().find((n) => nodeSignature(n.type, n.config) === want));
  });
  // Pass 2 — exact seed name, for nodes whose config drifted.
  seedNodes.forEach((seed, i) => {
    if (resolved[i]) return;
    claim(i, available().find((n) => n.name === seed.name));
  });
  // Pass 3 — the sole remaining node of that type (config may be missing entirely).
  seedNodes.forEach((seed, i) => {
    if (resolved[i]) return;
    const sameType = available().filter((n) => n.type === seed.type);
    if (sameType.length === 1) claim(i, sameType[0]);
  });

  // Mint ids for seed steps with no counterpart so edges can reference them.
  const insertNodes: PlannedNodeInsert[] = [];
  const resolvedIds: string[] = seedNodes.map((seed, i) => {
    const existing = resolved[i];
    if (existing) return existing.id;
    const id = newId();
    insertNodes.push({
      id,
      seedIndex: i,
      type: seed.type,
      name: seed.name,
      x: seed.x,
      y: seed.y,
      config: seed.config,
    });
    return id;
  });

  // Positions are load-bearing: the execution graph sorts by positionX and uses it
  // to split shared prefix / per-job branch / fan-in. Realign drifted nodes (e.g. a
  // Match Score still sitting before Store Job) without renaming them.
  const updatePositions: PlannedPositionUpdate[] = [];
  resolved.forEach((node, i) => {
    if (!node) return;
    const seed = seedNodes[i];
    if (node.position.x === seed.x && node.position.y === seed.y) return;
    updatePositions.push({ id: node.id, x: seed.x, y: seed.y });
  });

  const seedIds = new Set(resolvedIds);
  const desired: PlannedEdgeInsert[] = seedEdges.map((e) => ({
    source: resolvedIds[e.source],
    target: resolvedIds[e.target],
    label: e.label ?? null,
  }));
  const desiredKeys = new Set(desired.map((e) => edgeKey(e.source, e.target, e.label)));

  // Stale = an edge between two seed nodes that the seed topology doesn't define
  // (e.g. an old limit→match or ats→latex left from a previous node order). Leaving
  // it gives a node two outgoing edges and forks the run. Edges that touch a
  // user-added node are never considered — but edges touching a *deleted* node must
  // go, or they would dangle (and could violate a foreign key).
  const deleteEdgeIds = edges
    .filter((e) => {
      if (deleted.has(e.source) || deleted.has(e.target)) return true;
      return seedIds.has(e.source) && seedIds.has(e.target)
        && !desiredKeys.has(edgeKey(e.source, e.target, e.label ?? null));
    })
    .map((e) => e.id);

  // An edge that already exists but is being deleted (because it touched a retired
  // node) must not suppress a needed insert.
  const removedEdgeIds = new Set(deleteEdgeIds);
  const existingKeys = new Set(
    edges
      .filter((e) => !removedEdgeIds.has(e.id))
      .map((e) => edgeKey(e.source, e.target, e.label ?? null)),
  );
  const insertEdges = desired.filter((e) => !existingKeys.has(edgeKey(e.source, e.target, e.label)));

  return {
    insertNodes,
    updatePositions,
    deleteNodeIds,
    deleteEdgeIds,
    insertEdges,
    resolvedIds,
    isNoop: !insertNodes.length
      && !updatePositions.length
      && !deleteNodeIds.length
      && !deleteEdgeIds.length
      && !insertEdges.length,
  };
}
