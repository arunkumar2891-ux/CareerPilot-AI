import {
  canClaimScheduledSlot,
  computeNextCronRun,
  computeNextUtcTime,
  isAutomationDue,
  isCronDueNow,
  shouldStartScheduledAutomation,
} from './cron-schedule.ts';

Deno.test('isCronDueNow matches 07:00 UTC', () => {
  const due = isCronDueNow('0 7 * * *', new Date('2026-09-03T07:00:30.000Z'));
  if (!due) throw new Error('expected due at 07:00 UTC');
  const notDue = isCronDueNow('0 7 * * *', new Date('2026-09-03T07:01:00.000Z'));
  if (notDue) throw new Error('expected not due at 07:01 UTC');
});

Deno.test('computeNextCronRun returns same-day 07:00 UTC when before trigger', () => {
  const next = computeNextCronRun('0 7 * * *', new Date('2026-09-03T06:30:00.000Z'));
  if (next.toISOString() !== '2026-09-03T07:00:00.000Z') {
    throw new Error(`expected today 07:00 UTC, got ${next.toISOString()}`);
  }
});

Deno.test('computeNextCronRun rolls to tomorrow after trigger passed', () => {
  const next = computeNextCronRun('0 7 * * *', new Date('2026-09-03T08:00:00.000Z'));
  if (next.toISOString() !== '2026-09-04T07:00:00.000Z') {
    throw new Error(`expected tomorrow 07:00 UTC, got ${next.toISOString()}`);
  }
});

Deno.test('isAutomationDue runs at cron minute even when next_run is in the future', () => {
  const now = new Date('2026-09-03T07:00:00.000Z');
  const futureNext = new Date('2026-09-04T07:00:00.000Z');
  const due = isAutomationDue('0 7 * * *', futureNext, null, now);
  if (!due) throw new Error('cron minute should trigger even if next_run is tomorrow');
});

Deno.test('isAutomationDue waits for cron when next_run is null', () => {
  const before = isAutomationDue('0 7 * * *', null, null, new Date('2026-09-03T06:59:00.000Z'));
  if (before) throw new Error('should not be due before 07:00');
  const at = isAutomationDue('0 7 * * *', null, null, new Date('2026-09-03T07:00:00.000Z'));
  if (!at) throw new Error('should be due at 07:00');
});

Deno.test('isAutomationDue respects future next_run outside cron minute', () => {
  const future = new Date('2026-09-04T07:00:00.000Z');
  const due = isAutomationDue('0 7 * * *', future, null, new Date('2026-09-03T10:39:00.000Z'));
  if (due) throw new Error('should not be due at 10:39 when next_run is tomorrow');
});

Deno.test('isAutomationDue is not due again in the same UTC minute after last_run', () => {
  const now = new Date('2026-09-03T07:00:45.000Z');
  const lastRun = new Date('2026-09-03T07:00:05.000Z');
  const overdueNext = new Date('2026-09-03T07:00:00.000Z');
  const due = isAutomationDue('0 7 * * *', overdueNext, lastRun, now);
  if (due) throw new Error('overlapping scheduler ticks must not start a second run in the cron minute');
});

Deno.test('isAutomationDue is not due later the same UTC day when next_run is still in the past', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const lastRun = new Date('2026-09-03T07:00:05.000Z');
  const overdueNext = new Date('2026-09-03T07:00:00.000Z');
  const due = isAutomationDue('0 7 * * *', overdueNext, lastRun, now);
  if (due) throw new Error('stale next_run must not re-fire every scheduler tick after 07:00 UTC');
});

Deno.test('isAutomationDue catch-up fires once when yesterday last_run and next_run is overdue', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const lastRun = new Date('2026-09-02T07:00:00.000Z');
  const overdueNext = new Date('2026-09-03T07:00:00.000Z');
  const due = isAutomationDue('0 7 * * *', overdueNext, lastRun, now);
  if (!due) throw new Error('missed 07:00 UTC should catch up once later the same day');
});

Deno.test('isAutomationDue does not fire at cron minute if it already ran today', () => {
  const now = new Date('2026-09-03T07:00:00.000Z');
  const lastRun = new Date('2026-09-03T06:59:00.000Z');
  const futureNext = new Date('2026-09-04T07:00:00.000Z');
  const due = isAutomationDue('0 7 * * *', futureNext, lastRun, now);
  if (due) throw new Error('daily schedule must run at most once per UTC day');
});

Deno.test('canClaimScheduledSlot rejects a second claim after last_run moved', () => {
  const readLastRun = '2026-09-02T07:00:00.000Z';
  const first = canClaimScheduledSlot(readLastRun, readLastRun);
  const second = canClaimScheduledSlot('2026-09-03T07:00:01.000Z', readLastRun);
  if (!first) throw new Error('first overlapping tick should claim');
  if (second) throw new Error('second overlapping tick must lose the optimistic lock');
});

Deno.test('shouldStartScheduledAutomation skips when a scheduled run is already active today', () => {
  const now = new Date('2026-09-03T07:00:00.000Z');
  const start = shouldStartScheduledAutomation('0 7 * * *', null, null, now, {
    hasActiveScheduledRunToday: true,
  });
  if (start) throw new Error('must not start a second scheduled run while one is already active');
});
