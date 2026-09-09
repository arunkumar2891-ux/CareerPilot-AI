import { shouldYieldForNextJob } from './job-pipeline-slice.ts';

Deno.test('a failed job continues in-slice when wall-clock remains', () => {
  const yieldNext = shouldYieldForNextJob({
    remainingCount: 1,
    jobFailed: true,
    sliceElapsedMs: 32_000,
  });
  if (yieldNext) throw new Error('job 2 must start in this isolate after a 30s timeout');
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
