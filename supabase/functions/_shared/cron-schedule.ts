export interface CronFields {
  minute: number;
  hour: number;
}

/** Parse minute/hour from standard 5-field cron (UTC). */
export function parseCronFields(cronExpr: string): CronFields | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [minStr, hourStr] = parts;
  if (minStr === '*' || hourStr === '*') return null;
  const minute = Number.parseInt(minStr, 10);
  const hour = Number.parseInt(hourStr, 10);
  if (Number.isNaN(minute) || Number.isNaN(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return { minute, hour };
}

export function computeNextUtcTime(hour: number, minute: number, from: Date = new Date()): Date {
  const candidate = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    hour,
    minute,
    0,
    0,
  ));
  if (candidate.getTime() <= from.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

export function computeNextCronRun(cronExpr: string, from: Date = new Date()): Date {
  const fields = parseCronFields(cronExpr);
  if (!fields) return computeNextUtcTime(7, 0, from);
  return computeNextUtcTime(fields.hour, fields.minute, from);
}

/** True when the current UTC minute matches the cron schedule. */
export function isCronDueNow(cronExpr: string, now: Date = new Date()): boolean {
  const fields = parseCronFields(cronExpr);
  if (!fields) return false;
  return now.getUTCHours() === fields.hour && now.getUTCMinutes() === fields.minute;
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function utcDateKey(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function scheduleSlotKey(workflowName: string): string {
  return workflowName.trim().toLowerCase() || 'default';
}

export interface CanonicalAutomation {
  id?: string;
  user_id: string;
  workflow_id: string;
  created_at?: string | null;
  schedule_key?: string;
}

/** One active schedule per user+workflow, or per shared schedule_key when set. */
export function pickCanonicalAutomations<T extends CanonicalAutomation>(automations: T[]): T[] {
  const sorted = [...automations].sort((left, right) => {
    const created = String(left.created_at || '').localeCompare(String(right.created_at || ''));
    if (created !== 0) return created;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const auto of sorted) {
    const key = auto.schedule_key
      ? `${auto.user_id}:${auto.schedule_key}`
      : `${auto.user_id}:${auto.workflow_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(auto);
  }
  return picked;
}

export function ranOnUtcDay(lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return false;
  const last = new Date(lastRunAt);
  return last.getUTCFullYear() === now.getUTCFullYear()
    && last.getUTCMonth() === now.getUTCMonth()
    && last.getUTCDate() === now.getUTCDate();
}

/**
 * Optimistic lock: a scheduler tick may claim only if last_run is still the
 * value it read. Concurrent ticks that already wrote last_run lose.
 */
export function canClaimScheduledSlot(
  currentLastRun: string | null | undefined,
  expectedLastRun: string | null | undefined,
): boolean {
  const current = currentLastRun ?? null;
  const expected = expectedLastRun ?? null;
  return current === expected;
}

export function shouldStartScheduledAutomation(
  schedule: string,
  nextRunAt: Date | null,
  lastRunAt: Date | null,
  now: Date = new Date(),
  options?: { hasActiveScheduledRunToday?: boolean; hasScheduledRunToday?: boolean },
): boolean {
  if (options?.hasActiveScheduledRunToday || options?.hasScheduledRunToday) return false;
  return isAutomationDue(schedule, nextRunAt, lastRunAt, now);
}

export function isAutomationDue(
  schedule: string,
  nextRunAt: Date | null,
  lastRunAt: Date | null = null,
  now: Date = new Date(),
): boolean {
  if (ranOnUtcDay(lastRunAt, now)) return false;
  if (isCronDueNow(schedule, now)) return true;
  if (nextRunAt && nextRunAt.getTime() <= now.getTime()) return true;
  return false;
}
