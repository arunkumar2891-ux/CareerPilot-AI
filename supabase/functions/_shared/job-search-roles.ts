import { expandJobSearchQuery } from './job-url.ts';

export const INDIA_REMOTE_LOCATION = 'India';

/**
 * Hard cap on search roles. Each role becomes 1-2 search targets (2 when
 * "also search India remote" is on), and each target is now its own run with its
 * own summary email — so this bounds daily email volume at 10.
 *
 * Enforced here rather than only in the UI: settings are user-writable through
 * the `upsert_user_settings` RPC, so the backend must be the boundary.
 */
export const MAX_SEARCH_ROLES = 5;

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
  return roles.slice(0, MAX_SEARCH_ROLES);
}

export function maxJobsPerRole(jobSearch: Record<string, unknown> | undefined): number {
  const n = Number(jobSearch?.maxJobs ?? 5);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(40, Math.floor(n));
}

/**
 * Whether to add a second "remote in India" search target per role.
 *
 * Opt-**in**. This used to default to `true` for everyone, which doubled the
 * number of runs, the AI spend, and the summary emails for any user who does
 * not want jobs in India — a global default that only made sense for the app's
 * original single user.
 *
 * Existing users are unaffected: `ensureJobSearchDefaults` in
 * `src/services/index.ts` persists an explicit `alsoSearchIndiaRemote: true`
 * for accounts that predate this change, so only the *absence* of the setting
 * now means off.
 */
export function alsoSearchIndiaRemote(jobSearch: Record<string, unknown> | undefined): boolean {
  const value = jobSearch?.alsoSearchIndiaRemote;
  return value === true || value === 'true';
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
