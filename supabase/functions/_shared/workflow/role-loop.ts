import { buildSearchTargets } from '../job-search-roles.ts';
import type { WorkflowNodeRow } from './types.ts';

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
