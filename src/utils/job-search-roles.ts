/**
 * Hard cap on search roles. Each role becomes 1-2 search targets (2 when
 * "also search India remote" is on), and each target is its own workflow run
 * with its own summary email — so this bounds daily email volume at 10.
 *
 * Mirrors `MAX_SEARCH_ROLES` in `supabase/functions/_shared/job-search-roles.ts`,
 * which is the authoritative boundary (settings are user-writable via RPC).
 */
export const MAX_SEARCH_ROLES = 5;

export function normalizeJobSearchRoles(
  roles: unknown,
  fallbackQuery?: unknown,
  limit = MAX_SEARCH_ROLES,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: unknown) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  if (Array.isArray(roles)) {
    for (const role of roles) push(role);
  }
  if (!out.length) push(fallbackQuery);
  return limit > 0 ? out.slice(0, limit) : out;
}
