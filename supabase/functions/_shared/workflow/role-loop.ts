import { buildSearchTargets, type SearchTarget } from '../job-search-roles.ts';
import type { WorkflowEdgeRow, WorkflowNodeRow } from './types.ts';

export function isRoleLoopStart(node: { type: string; config?: Record<string, unknown> }): boolean {
  return node.type === 'transform' && node.config?.action === 'build_linkedin_url';
}

export function isFanInNode(node: {
  type: string;
  name?: string;
  config?: Record<string, unknown>;
}): boolean {
  if (node.type === 'email') return true;
  return node.type === 'function' && node.config?.builtin === 'email_summary';
}

export function isSharedPrefixNode(node: { type: string }): boolean {
  return ['schedule', 'trigger', 'webhook', 'gdocs'].includes(node.type);
}

export function findRoleLoopStart<T extends { type: string; config?: Record<string, unknown> }>(
  nodes: T[],
): T | undefined {
  return nodes.find(isRoleLoopStart);
}

export function roleSubgraphNodeIds(
  nodes: Array<{ id: string; type: string; name?: string; config?: Record<string, unknown> }>,
  edges: Array<{ source_id?: string; sourceId?: string; target_id?: string; targetId?: string }>,
): Set<string> {
  const start = findRoleLoopStart(nodes);
  if (!start) return new Set();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    if (isFanInNode(node)) continue;
    ids.add(id);
    for (const edge of edges) {
      const source = edge.source_id ?? edge.sourceId;
      const target = edge.target_id ?? edge.targetId;
      if (source === id && target) queue.push(target);
    }
  }
  return ids;
}

export function nextJobIndexOffset(existingMaxIndex: number | null | undefined): number {
  const n = Number(existingMaxIndex ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function applySearchTarget(vars: Record<string, unknown>, target: SearchTarget): void {
  vars.currentRole = target.role;
  vars.currentLocation = target.location;
  vars.remoteOnly = target.remoteOnly;
  vars.currentSearchLabel = target.label;
}

function isSearchTarget(value: unknown): value is SearchTarget {
  if (!value || typeof value !== 'object') return false;
  return Boolean(String((value as SearchTarget).role || '').trim());
}

/** In-flight runs stored `searchRoles` before search targets existed. Keep those as location-only. */
function coerceSearchTargets(
  vars: Record<string, unknown>,
  jobSearch: Record<string, unknown> | undefined,
): SearchTarget[] {
  const existing = Array.isArray(vars.searchTargets)
    ? (vars.searchTargets as unknown[]).filter(isSearchTarget)
    : [];
  if (existing.length) return existing;

  const legacy = Array.isArray(vars.searchRoles)
    ? (vars.searchRoles as unknown[]).map((role) => String(role).trim()).filter(Boolean)
    : [];
  if (legacy.length) {
    const location = String(vars.currentLocation || jobSearch?.location || '').trim() || 'United States';
    return legacy.map((role) => ({
      role,
      location,
      remoteOnly: false,
      label: role,
    }));
  }
  return buildSearchTargets(jobSearch);
}

export function ensureSearchRoleContext(
  vars: Record<string, unknown>,
  jobSearch: Record<string, unknown> | undefined,
): SearchTarget[] {
  const targets = coerceSearchTargets(vars, jobSearch);
  vars.searchTargets = targets;
  const idx = Number(vars.roleIndex ?? 0);
  const safeIndex = Number.isFinite(idx) && idx >= 0 && idx < targets.length ? idx : 0;
  vars.roleIndex = safeIndex;
  applySearchTarget(vars, targets[safeIndex] || {
    role: '',
    location: 'United States',
    remoteOnly: false,
    label: '',
  });
  return targets;
}

const ROLE_RESET_KEYS = [
  'jobExecutionsInitialized',
  'pendingJobItems',
  'pendingJobExecutionIds',
  'jobPipelineResults',
  'jobPipelineTotal',
  'pipelineSliceStartedAt',
  'apifyRunId',
  'apifyDatasetId',
  'batchProgress',
] as const;

export function applyNextSearchRole(vars: Record<string, unknown>, targets: SearchTarget[]): boolean {
  const next = Number(vars.roleIndex ?? 0) + 1;
  if (next >= targets.length) return false;
  vars.roleIndex = next;
  applySearchTarget(vars, targets[next]);
  for (const key of ROLE_RESET_KEYS) delete vars[key];
  return true;
}

export function currentSearchRole(
  vars: Record<string, unknown>,
  jobSearch?: Record<string, unknown>,
): string {
  const fromCtx = String(vars.currentRole || '').trim();
  if (fromCtx) return fromCtx;
  return buildSearchTargets(jobSearch)[0]?.role || '';
}

export function currentSearchLabel(vars: Record<string, unknown>): string {
  return String(vars.currentSearchLabel || vars.currentRole || '').trim();
}

export function currentSearchLocation(
  vars: Record<string, unknown>,
  jobSearch?: Record<string, unknown>,
): string {
  const fromCtx = String(vars.currentLocation || '').trim();
  if (fromCtx) return fromCtx;
  return String(jobSearch?.location || '').trim() || 'United States';
}

export function isRemoteOnlySearch(vars: Record<string, unknown>): boolean {
  return vars.remoteOnly === true || vars.remoteOnly === 'true';
}

export function searchRoleForNode(
  node: WorkflowNodeRow,
  vars: Record<string, unknown>,
): string | null {
  if (isSharedPrefixNode(node) || isFanInNode(node)) return null;
  const label = currentSearchLabel(vars);
  return label || null;
}

export function groupJobExecutionsByRole<T extends { searchRole?: string | null }>(
  jobs: T[],
): { role: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const job of jobs) {
    const role = String(job.searchRole || '').trim();
    if (!role) continue;
    if (!map.has(role)) {
      order.push(role);
      map.set(role, []);
    }
    map.get(role)!.push(job);
  }
  return order.map((role) => ({ role, items: map.get(role)! }));
}
