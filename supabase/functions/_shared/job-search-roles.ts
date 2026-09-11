import { expandJobSearchQuery } from './job-url.ts';

export const INDIA_REMOTE_LOCATION = 'India';

export interface SearchTarget {
  role: string;
  location: string;
  remoteOnly: boolean;
  label: string;
}

export function parseJobSearchRoles(jobSearch: Record<string, unknown> | undefined): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  const push = (raw: unknown) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return;
    const expanded = expandJobSearchQuery(trimmed);
    if (!expanded) return;
    const key = expanded.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    roles.push(expanded);
  };

  const listed = jobSearch?.roles;
  if (Array.isArray(listed) && listed.length) {
    for (const role of listed) push(role);
  }
  if (!roles.length) push(jobSearch?.query);
  if (!roles.length) push('Software Engineer');
  return roles;
}

export function maxJobsPerRole(jobSearch: Record<string, unknown> | undefined): number {
  const n = Number(jobSearch?.maxJobs ?? 5);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(40, Math.floor(n));
}

export function nextSearchRole(
  roles: string[],
  currentIndex: number,
): { role: string; index: number } | null {
  const next = currentIndex + 1;
  if (next >= roles.length) return null;
  return { role: roles[next], index: next };
}

export function alsoSearchIndiaRemote(jobSearch: Record<string, unknown> | undefined): boolean {
  const value = jobSearch?.alsoSearchIndiaRemote;
  if (value === false || value === 'false') return false;
  return true;
}

export function buildSearchTargets(jobSearch: Record<string, unknown> | undefined): SearchTarget[] {
  const roles = parseJobSearchRoles(jobSearch);
  const location = String(jobSearch?.location || '').trim() || 'United States';
  const includeIndiaRemote = alsoSearchIndiaRemote(jobSearch);
  const targets: SearchTarget[] = [];
  for (const role of roles) {
    targets.push({
      role,
      location,
      remoteOnly: false,
      label: role,
    });
    if (includeIndiaRemote) {
      targets.push({
        role,
        location: INDIA_REMOTE_LOCATION,
        remoteOnly: true,
        label: `${role} · India remote`,
      });
    }
  }
  return targets;
}
