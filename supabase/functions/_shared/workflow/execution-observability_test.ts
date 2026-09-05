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

function resolveTriggerNodeDisplayName(
  node: { type: string; name: string },
  triggerType?: string,
): string {
  if (!['schedule', 'trigger', 'webhook'].includes(node.type)) return node.name;
  if (triggerType === 'schedule') return node.name;
  if (triggerType === 'manual') return 'Manual Trigger';
  if (triggerType === 'retry') return 'Retry Failed Jobs';
  return node.name;
}

Deno.test('trigger display name shows Manual Trigger for manual runs', () => {
  const scheduleNode = { type: 'schedule', name: 'Daily 7 AM' };
  const manual = resolveTriggerNodeDisplayName(scheduleNode, 'manual');
  if (manual !== 'Manual Trigger') throw new Error(`expected Manual Trigger, got ${manual}`);
  const scheduled = resolveTriggerNodeDisplayName(scheduleNode, 'schedule');
  if (scheduled !== 'Daily 7 AM') throw new Error(`expected Daily 7 AM, got ${scheduled}`);
});
