/**
 * Match-score gate for the per-job fan-out.
 *
 * `Match Score` is the first node inside the fan-out (right after `Store Job`).
 * It scores the job against the MASTER resume and, when the score does not beat
 * `settings.jobSearch.minMatchScore`, halts the rest of that job's chain so no
 * AI spend (ATS Optimizer), LaTeX build, PDF compile or upload happens.
 *
 * The gate is expressed as a *skip output* rather than a `true`/`false` edge
 * because `executePerJobPipeline` walks the per-job chain by array index and
 * ignores `result.route` — edge labels only steer the top-level executor. This
 * mirrors the existing duplicate skip (`isDuplicateSkipOutput`).
 *
 * Skipped jobs are NOT dropped: they stay in the jobs table with their real
 * score, remain in the `discovered` state, and are reported in the summary
 * email via `ctx.variables.belowThresholdJobs`.
 */

export const DEFAULT_MIN_MATCH_SCORE = 80;

/** Reason tag on the skip output. Must stay distinct from `'duplicate'`. */
export const BELOW_MATCH_SCORE_REASON = 'below_match_score';

/**
 * Resolves `settings.jobSearch.minMatchScore`, defaulting to 80.
 *
 * A threshold of 100 could never be beaten (scores are 0-100 and the gate is
 * strictly `>`), so it is clamped to 99 to keep the pipeline usable. Negative,
 * non-numeric and missing values fall back to the default.
 */
export function minMatchScore(jobSearch: Record<string, unknown> | undefined): number {
  const raw = jobSearch?.minMatchScore;
  if (raw === null || raw === undefined || raw === '') return DEFAULT_MIN_MATCH_SCORE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MIN_MATCH_SCORE;
  return Math.min(99, Math.floor(n));
}

/** The gate is strictly greater-than: a score equal to the threshold is skipped. */
export function passesMatchGate(score: number, threshold: number): boolean {
  const value = Number(score);
  if (!Number.isFinite(value)) return false;
  return value > threshold;
}

export interface BelowMatchScoreSkip extends Record<string, unknown> {
  skipped: true;
  reason: typeof BELOW_MATCH_SCORE_REASON;
  matchScore: number;
  matchThreshold: number;
}

/**
 * Builds the skip output. The whole job is spread back in so the summary email
 * and the job-execution checkpoint keep the company, role and link.
 */
export function belowMatchScoreSkip(
  job: Record<string, unknown>,
  score: number,
  threshold: number,
): BelowMatchScoreSkip {
  return {
    ...job,
    matchScore: score,
    matchThreshold: threshold,
    skipped: true,
    reason: BELOW_MATCH_SCORE_REASON,
  };
}

/** True only for match-gate skips — duplicate skips must keep their own handling. */
export function isBelowMatchScoreSkip(output: unknown): boolean {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return false;
  const row = output as Record<string, unknown>;
  return row.skipped === true && String(row.reason || '') === BELOW_MATCH_SCORE_REASON;
}

function jobLabel(row: Record<string, unknown>): string {
  const company = String(row.company ?? row.companyName ?? '').trim();
  const role = String(row.roleName ?? row.title ?? row.role ?? '').trim();
  if (company && role) return `${company} — ${role}`;
  return company || role || 'Unknown company';
}

/**
 * Per-node log lines for the `Match Score` step, so opening that node in the
 * execution graph shows which company was scored and what it scored. Mirrors
 * `storedFileLogMessages` for the storage node.
 */
export function matchScoreLogMessages(output: unknown): string[] {
  const items = Array.isArray(output) ? output : [output];
  const messages: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const score = row.matchScore;
    if (score === null || score === undefined || !Number.isFinite(Number(score))) continue;

    const value = Number(score);
    const source = String(row.matchScoreSource ?? '').trim();
    const against = source ? ` against ${source}` : '';

    if (isBelowMatchScoreSkip(row)) {
      const threshold = Number(row.matchThreshold ?? DEFAULT_MIN_MATCH_SCORE);
      messages.push(
        `${jobLabel(row)} — match score ${value}%${against}. `
        + `At or below the ${threshold}% threshold, so resume generation was skipped `
        + `and the job stays in Discovered.`,
      );
      continue;
    }

    const threshold = row.matchThreshold;
    const gate = Number.isFinite(Number(threshold))
      ? ` Above the ${Number(threshold)}% threshold, continuing to ATS Optimizer.`
      : '';
    messages.push(`${jobLabel(row)} — match score ${value}%${against}.${gate}`);
  }
  return messages;
}

/** Company names and titles come from scraped listings, so never inline them raw. */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links are emitted, so a scraped `javascript:` URL cannot ship in the email. */
function safeHref(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  return escapeHtml(raw);
}

/**
 * The "below threshold" table for the summary email. These jobs were stored and
 * scored but skipped before resume generation, so there is no PDF column — just
 * the score and a link, plus a note that the user can generate a resume by hand.
 *
 * Returns `''` when nothing was skipped so callers can append unconditionally.
 */
export function belowThresholdEmailSection(jobs: unknown): string {
  const rows = (Array.isArray(jobs) ? jobs : [])
    .filter((job): job is Record<string, unknown> => Boolean(job) && typeof job === 'object');
  if (!rows.length) return '';

  const threshold = Number(rows[0].matchThreshold ?? DEFAULT_MIN_MATCH_SCORE);
  let html = `<h3 style="margin-top:24px">Below your ${threshold}% match threshold (${rows.length})</h3>`
    + '<p style="margin:4px 0 8px;color:#555">'
    + 'Stored and scored, but resume generation was skipped. These stay in '
    + '<strong>Discovered</strong> — open one and run resume generation manually to continue.'
    + '</p>'
    + '<table border="1" cellpadding="8" cellspacing="0">'
    + '<tr><th>Company</th><th>Role</th><th>Match</th><th>Job</th></tr>';

  for (const row of [...rows].sort((a, b) => Number(b.matchScore ?? 0) - Number(a.matchScore ?? 0))) {
    const href = safeHref(row.jobLink ?? row.url);
    const link = href ? `<a href="${href}">View</a>` : '—';
    html += `<tr><td>${escapeHtml(row.company ?? row.companyName ?? '')}</td>`
      + `<td>${escapeHtml(row.roleName ?? row.title ?? row.role ?? '')}</td>`
      + `<td>${Number(row.matchScore ?? 0)}%</td>`
      + `<td>${link}</td></tr>`;
  }
  return `${html}</table>`;
}
