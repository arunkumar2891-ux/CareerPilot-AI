import { flattenJobItems, normalizeLinkedInJobUrl } from './job-url.ts';

export function normalizeDedupeText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Same posting under different LinkedIn IDs still collapses to one fingerprint. */
export function jobContentFingerprint(job: Record<string, unknown>): string {
  const company = normalizeDedupeText(job.company ?? job.companyName);
  const role = normalizeDedupeText(job.role ?? job.title);
  const location = normalizeDedupeText(job.location);
  const description = normalizeDedupeText(job.jobDescription ?? job.description).slice(0, 400);
  if (!company && !role) return '';
  return `${company}|${role}|${location}|${description}`;
}

export function jobUrlKey(job: Record<string, unknown>): string {
  return normalizeLinkedInJobUrl(String(job.jobLink || job.link || job.url || job.jobUrl || ''));
}

export function collectJobDedupeKeys(job: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const url = jobUrlKey(job);
  if (url) keys.push(`url:${url}`);
  const fingerprint = jobContentFingerprint(job);
  if (fingerprint) keys.push(`fp:${fingerprint}`);
  return keys;
}

export function filterDuplicateJobs(
  input: unknown,
  existingKeys: Iterable<string> = [],
): { kept: Record<string, unknown>[]; skippedDuplicate: number; skippedNoIdentity: number } {
  const seen = new Set(existingKeys);
  const kept: Record<string, unknown>[] = [];
  let skippedDuplicate = 0;
  let skippedNoIdentity = 0;

  for (const item of flattenJobItems(input)) {
    const keys = collectJobDedupeKeys(item);
    if (!keys.length) {
      skippedNoIdentity++;
      continue;
    }
    if (keys.some((key) => seen.has(key))) {
      skippedDuplicate++;
      continue;
    }
    for (const key of keys) seen.add(key);
    const url = jobUrlKey(item);
    if (url) item.jobLink = url;
    kept.push(item);
  }

  return { kept, skippedDuplicate, skippedNoIdentity };
}

export function isDuplicateConstraintError(
  error: { code?: string; message?: string; details?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const blob = `${error.code || ''} ${error.message || ''} ${error.details || ''}`;
  return error.code === '23505'
    || /duplicate key/i.test(blob)
    || /unique constraint/i.test(blob)
    || /jobs_user_url_uidx|jobs_user_fingerprint_uidx/i.test(blob);
}

export function isDuplicateSkipOutput(output: unknown): boolean {
  if (!output || typeof output !== 'object') return false;
  const row = output as Record<string, unknown>;
  return row.skipped === true && String(row.reason || '') === 'duplicate';
}

/** Unique-index races skip the job; they must not abort the run. */
export function resolveJobInsertConflict(
  error: { code?: string; message?: string; details?: string } | null | undefined,
  existingId?: string | null,
): { skipped: true; reason: 'duplicate'; jobId?: string } | null {
  if (!isDuplicateConstraintError(error)) return null;
  return {
    skipped: true,
    reason: 'duplicate',
    ...(existingId ? { jobId: existingId } : {}),
  };
}

export function emptyJobRunDetail(stats: {
  scraped: number;
  parsed: number;
  afterDedupe: number;
  skippedDuplicate: number;
  skippedNoLink: number;
  skippedInsertDuplicate?: number;
  skippedParseDuplicate?: number;
  skippedQueryMismatch?: number;
}): string {
  const insertSkips = Number(stats.skippedInsertDuplicate ?? 0);
  const parseSkips = Number(stats.skippedParseDuplicate ?? 0);
  const querySkips = Number(stats.skippedQueryMismatch ?? 0);
  const totalDupes = stats.skippedDuplicate + insertSkips + parseSkips;
  if (stats.scraped === 0) {
    return 'Apify returned no job listings for your LinkedIn search URL. Try broadening location or keywords in Settings.';
  }
  if (stats.parsed === 0) {
    if (querySkips > 0) {
      return `Apify returned ${stats.scraped} listings but ${querySkips} did not match your search query — try a more specific title in Settings.`;
    }
    return `Apify returned ${stats.scraped} listings but none could be parsed into jobs (missing descriptions or links).`;
  }
  const allInsertSkipped = stats.afterDedupe > 0 && insertSkips >= stats.afterDedupe;
  if ((stats.afterDedupe === 0 && totalDupes > 0) || allInsertSkipped) {
    const n = Math.max(totalDupes, insertSkips, stats.skippedDuplicate);
    return `All ${n} new job(s) were already in your jobs table — no new listings to process.`;
  }
  if (stats.afterDedupe === 0 && stats.skippedNoLink > 0) {
    return `${stats.skippedNoLink} parsed job(s) could not be processed because the job URL was missing.`;
  }
  if (stats.afterDedupe === 0) {
    return `${stats.parsed} job(s) were parsed but none were queued for tailoring.`;
  }
  return 'No new resumes were generated today.';
}
