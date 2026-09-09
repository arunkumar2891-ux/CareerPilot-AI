/** Leave headroom under the ~150s Edge Function wall clock. */
export const PIPELINE_SLICE_BUDGET_MS = 90_000;

/**
 * Successful tailoring is expensive — yield so the next job gets a fresh isolate.
 * A failed/timed-out job should not block siblings on a follow-up invocation that
 * may never start (waitUntil + scheduler). Keep going in this slice when there is time.
 */
export function shouldYieldForNextJob(opts: {
  remainingCount: number;
  jobFailed: boolean;
  sliceElapsedMs: number;
  sliceBudgetMs?: number;
}): boolean {
  if (opts.remainingCount <= 0) return false;
  const budget = opts.sliceBudgetMs ?? PIPELINE_SLICE_BUDGET_MS;
  if (opts.jobFailed && opts.sliceElapsedMs < budget) return false;
  return true;
}
