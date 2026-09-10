/** Leave headroom under the ~150s Edge Function wall clock. */
export const PIPELINE_SLICE_BUDGET_MS = 90_000;
/** Only keep going in-slice after a failure if ATS barely ran. */
export const PIPELINE_FAST_FAIL_CONTINUE_MS = 25_000;
/** After ATS, yield so latex/pdf/storage are not killed by the 150s wall. */
export const PIPELINE_MID_CHAIN_YIELD_MS = 110_000;

/**
 * Successful tailoring is expensive — yield so the next job gets a fresh isolate.
 * A fast failed job can continue in this slice. A slow ATS failure must yield so
 * siblings still get latex/pdf/storage time.
 */
export function shouldYieldForNextJob(opts: {
  remainingCount: number;
  jobFailed: boolean;
  sliceElapsedMs: number;
  sliceBudgetMs?: number;
}): boolean {
  if (opts.remainingCount <= 0) return false;
  const budget = opts.sliceBudgetMs ?? PIPELINE_SLICE_BUDGET_MS;
  if (opts.jobFailed && opts.sliceElapsedMs < PIPELINE_FAST_FAIL_CONTINUE_MS && opts.sliceElapsedMs < budget) {
    return false;
  }
  return true;
}

export function shouldYieldMidChain(opts: {
  remainingChainCount: number;
  sliceElapsedMs: number;
  sliceLimitMs?: number;
}): boolean {
  if (opts.remainingChainCount <= 0) return false;
  return opts.sliceElapsedMs >= (opts.sliceLimitMs ?? PIPELINE_MID_CHAIN_YIELD_MS);
}
