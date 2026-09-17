import type { Job } from '../types';

/**
 * Pure selection / filtering logic for the Jobs page.
 *
 * Extracted from `src/pages/JobsPage.tsx` so it can be unit-tested without a DOM
 * or a Supabase client. `JobsPage` keeps the React state and side effects; every
 * decision about *which* jobs an action applies to lives here.
 *
 * This matters most for auto-apply: `selectApplyableJobs` is what decides which
 * jobs get a real email sent to them. See `src/utils/job-kanban.ts` for the same
 * pattern applied to the board.
 */

/** The subset of the Jobs page filter form this module reads. */
export interface JobFilterCriteria {
  /** Free-text search over role and company. */
  search: string;
  remote: boolean;
  hybrid: boolean;
  /** Exact match against `Job.experience`; empty string means "any". */
  experience: string;
  /** Numeric string from a form input; empty or non-numeric means "no minimum". */
  salaryMin: string;
}

/**
 * Does one job pass the filter bar?
 *
 * Case-insensitive search matches role **or** company. `remote`/`hybrid` are
 * independent opt-in narrowing flags, not a radio pair — checking both requires
 * a job to be flagged both, which is intentional (some listings are).
 */
export function matchesJobFilters(job: Job, criteria: JobFilterCriteria): boolean {
  const search = criteria.search.trim().toLowerCase();
  if (search) {
    const inRole = job.role.toLowerCase().includes(search);
    const inCompany = job.company.toLowerCase().includes(search);
    if (!inRole && !inCompany) return false;
  }

  if (criteria.remote && !job.remote) return false;
  if (criteria.hybrid && !job.hybrid) return false;
  if (criteria.experience && job.experience !== criteria.experience) return false;

  if (criteria.salaryMin) {
    // `parseInt` on a non-numeric string yields NaN; treat that as "no minimum"
    // rather than letting every comparison fail and blank the list.
    const min = parseInt(criteria.salaryMin, 10);
    if (!Number.isNaN(min) && (job.salaryMin || 0) < min) return false;
  }

  return true;
}

/** Apply the filter bar to a whole list. Tolerates `undefined` while the query loads. */
export function filterJobs(jobs: Job[] | undefined, criteria: JobFilterCriteria): Job[] {
  return (jobs || []).filter((job) => matchesJobFilters(job, criteria));
}

/**
 * Jobs that auto-apply may send email for.
 *
 * **This gates a real outbound email**, so all four conditions are required:
 * the user selected it, we have an address, the tailored resume is ready to
 * attach, and we have not already applied. Loosening any of these means sending
 * mail the user did not ask for, sending it with no resume, or double-applying.
 */
export function selectApplyableJobs(jobs: Job[] | undefined, selectedIds: ReadonlySet<string>): Job[] {
  return (jobs || []).filter(
    (job) =>
      selectedIds.has(job.id) &&
      !!job.applyEmail &&
      job.resumeStatus === 'ready' &&
      job.status !== 'applied',
  );
}

/** Selected jobs with no apply address yet — the candidates for email extraction. */
export function selectExtractableJobs(jobs: Job[] | undefined, selectedIds: ReadonlySet<string>): Job[] {
  return (jobs || []).filter((job) => selectedIds.has(job.id) && !job.applyEmail);
}

/**
 * Does this error mean Gmail send scope is missing, rather than a generic failure?
 *
 * The backend surfaces `gmail_scope_missing`; the human-readable variant asks the
 * user to reconnect Google. Both need the "Go to Integrations" recovery action
 * instead of a bare error toast, because retrying cannot succeed.
 */
export function isGmailScopeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /gmail_scope_missing|reconnect Google/i.test(message);
}

/** Extract a message from an `unknown` catch binding, with a caller-supplied fallback. */
export function errorMessageOr(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
