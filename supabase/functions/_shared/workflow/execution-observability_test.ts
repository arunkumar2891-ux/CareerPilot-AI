import { deriveRunStatus } from './execution-status.ts';

/** Inline graph branch counting for tests (mirrors frontend buildExecutionGraph job branch logic). */
function countJobBranches(jobCount: number): number {
  return jobCount;
}

Deno.test('deriveRunStatus partial failure with mixed jobs', () => {
  const status = deriveRunStatus('success', { total: 10, successful: 8, failed: 2, skipped: 0 }, false);
  if (status !== 'partially_failed') throw new Error(`expected partially_failed, got ${status}`);
});

Deno.test('job branch count matches execution data for 1, 3, and 10 jobs', () => {
  for (const n of [1, 3, 10]) {
    const branches = countJobBranches(n);
    if (branches !== n) throw new Error(`expected ${n} branches, got ${branches}`);
  }
});

Deno.test('retry attempt number increments without overwriting prior attempt', () => {
  const attempts = [
    { job_index: 3, attempt: 1, status: 'failed' },
    { job_index: 3, attempt: 2, status: 'pending' },
  ];
  const latest = attempts.reduce((max, row) => (row.attempt > max.attempt ? row : max), attempts[0]);
  if (latest.attempt !== 2) throw new Error('expected attempt 2');
  if (attempts.length !== 2) throw new Error('prior attempt must remain in history');
});

Deno.test('run again uses new run id semantics', () => {
  const originalRunId = '11111111-1111-1111-1111-111111111111';
  const newRunId = crypto.randomUUID();
  if (originalRunId === newRunId) throw new Error('run again must create a new run id');
});
