import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate several independent query caches.
 *
 * TanStack Query matches `queryKey` by **prefix**, so
 * `invalidateQueries({ queryKey: ['jobs', 'applications'] })` targets the single
 * two-element key `['jobs', 'applications']` — it does **not** invalidate the
 * `['jobs']` and `['applications']` queries. Every `useQuery` in this app
 * registers a one-element key, so the combined form matched nothing and silently
 * did no work: after auto-apply sent a real email, neither the job list nor the
 * Applications page refreshed.
 *
 * Pass the keys here instead and each is invalidated as its own prefix.
 *
 * ```ts
 * await invalidateAll(qc, ['jobs', 'applications']); // two caches, both refetch
 * ```
 */
export async function invalidateAll(qc: QueryClient, keys: readonly string[]): Promise<void> {
  await Promise.all(keys.map((key) => qc.invalidateQueries({ queryKey: [key] })));
}
