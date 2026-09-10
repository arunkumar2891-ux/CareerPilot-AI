import { shouldYieldForNextJob, shouldYieldMidChain } from './job-pipeline-slice.ts';

Deno.test('a failed job continues in-slice only when the failure was fast', () => {
  const yieldNext = shouldYieldForNextJob({
    remainingCount: 1,
    jobFailed: true,
    sliceElapsedMs: 8_000,
  });
  if (yieldNext) throw new Error('a quick validation miss can start job 2 in this isolate');
});

Deno.test('a failed job yields after a slow ATS attempt so siblings get a full slice', () => {
  const yieldNext = shouldYieldForNextJob({
    remainingCount: 1,
    jobFailed: true,
    sliceElapsedMs: 32_000,
  });
  if (!yieldNext) throw new Error('job 2 must not share the isolate after a 30s+ ATS failure');
});

Deno.test('a successful job still yields so the next job gets a fresh isolate', () => {
  const yieldNext = shouldYieldForNextJob({
    remainingCount: 1,
    jobFailed: false,
    sliceElapsedMs: 20_000,
  });
  if (!yieldNext) throw new Error('successful tailoring must yield to the next slice');
});

Deno.test('a failed job yields when the slice budget is exhausted', () => {
  const yieldNext = shouldYieldForNextJob({
    remainingCount: 1,
    jobFailed: true,
    sliceElapsedMs: 91_000,
  });
  if (!yieldNext) throw new Error('must yield when the slice is out of time');
});

Deno.test('ATS success yields remaining chain nodes when the slice is almost out of time', () => {
  const yieldNext = shouldYieldMidChain({
    remainingChainCount: 3,
    sliceElapsedMs: 112_000,
  });
  if (!yieldNext) throw new Error('storage must not start in an isolate that already spent 110s');
});

Deno.test('mid-chain does not yield when latex/pdf/storage still have time', () => {
  const yieldNext = shouldYieldMidChain({
    remainingChainCount: 3,
    sliceElapsedMs: 40_000,
  });
  if (yieldNext) throw new Error('must finish storage in this slice after a fast ATS');
});
