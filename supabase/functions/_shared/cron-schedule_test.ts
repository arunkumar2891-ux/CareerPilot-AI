import {
  computeNextCronRun,
  computeNextUtcTime,
  isAutomationDue,
  isCronDueNow,
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
