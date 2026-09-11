import { expandJobSearchQuery } from './job-url.ts';

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
