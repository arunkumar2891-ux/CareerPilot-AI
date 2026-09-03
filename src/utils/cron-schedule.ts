export interface CronFields {
  minute: number;
  hour: number;
}

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
