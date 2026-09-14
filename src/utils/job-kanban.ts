import type { Job, JobStatus } from '../types';

/**
 * Kanban board model for the Jobs page.
 *
 * The column list, the grouping, and the optimistic cache update all live here
 * as pure functions so they can be unit-tested without a DOM. `JobKanbanBoard`
 * owns only the drag-and-drop interaction on top of this.
 */

export interface JobKanbanColumn {
  status: JobStatus;
  label: string;
  /** Shown inside the column when it is empty, so the board never looks broken. */
  hint: string;
}

/**
 * Left-to-right pipeline order. This is also the order the "Move to" menu uses,
 * so it should read as a progression.
 */
export const JOB_KANBAN_COLUMNS: readonly JobKanbanColumn[] = [
  { status: 'discovered', label: 'Discovered', hint: 'Newly found jobs land here' },
  { status: 'queued', label: 'Queued', hint: 'Resume generation in progress' },
  { status: 'resume_ready', label: 'Resume Ready', hint: 'Tailored resume is ready to send' },
  { status: 'applied', label: 'Applied', hint: 'Application submitted' },
  { status: 'interview', label: 'Interview', hint: 'You are talking to them' },
  { status: 'offer', label: 'Offer', hint: 'Offer received' },
  { status: 'rejected', label: 'Rejected', hint: 'Closed out' },
  { status: 'withdrawn', label: 'Withdrawn', hint: 'You pulled out' },
] as const;

const KNOWN_STATUSES: ReadonlySet<string> = new Set(JOB_KANBAN_COLUMNS.map((c) => c.status));

export function isKnownJobStatus(status: string): status is JobStatus {
  return KNOWN_STATUSES.has(status);
}

export function jobStatusLabel(status: string): string {
  return JOB_KANBAN_COLUMNS.find((c) => c.status === status)?.label ?? status;
}

export interface GroupedJobs {
  /** One entry per column, in `JOB_KANBAN_COLUMNS` order. */
  columns: Array<{ column: JobKanbanColumn; jobs: Job[] }>;
  /** Rows whose status is not a known column — surfaced so they cannot vanish. */
  unfiled: Job[];
}

/** Groups jobs into columns, preserving the incoming (already sorted) order. */
export function groupJobsByStatus(jobs: readonly Job[]): GroupedJobs {
  const byStatus = new Map<JobStatus, Job[]>(
    JOB_KANBAN_COLUMNS.map((c) => [c.status, [] as Job[]]),
  );
  const unfiled: Job[] = [];
  for (const job of jobs) {
    const bucket = byStatus.get(job.status as JobStatus);
    if (bucket && isKnownJobStatus(job.status)) bucket.push(job);
    else unfiled.push(job);
  }
  return {
    columns: JOB_KANBAN_COLUMNS.map((column) => ({ column, jobs: byStatus.get(column.status)! })),
    unfiled,
  };
}

/**
 * Optimistic cache update: returns a new array with one job's status changed.
 *
 * Position is preserved rather than re-sorted — a card that jumps to a
 * different index the instant you drop it reads as a bug.
 */
export function withJobStatus(
  jobs: readonly Job[],
  jobId: string,
  status: JobStatus,
): Job[] {
  return jobs.map((job) => (job.id === jobId ? { ...job, status } : job));
}

/** True when dropping would not change anything, so the write can be skipped. */
export function isRedundantMove(job: Pick<Job, 'status'>, to: JobStatus): boolean {
  return job.status === to;
}

/**
 * A caveat worth surfacing after an otherwise-legal move. Every move is
 * permitted — this is the user's board — but silently labelling a job
 * "Resume Ready" when no resume exists would be misleading.
 */
export function jobMoveWarning(
  job: Pick<Job, 'resumeId' | 'pdfUrl' | 'resumeStatus'>,
  to: JobStatus,
): string | null {
  const hasResume = Boolean(job.resumeId || job.pdfUrl || job.resumeStatus === 'ready');
  if (to === 'resume_ready' && !hasResume) {
    return 'No resume is attached yet — generate one from the job detail view.';
  }
  if (to === 'applied' && !hasResume) {
    return 'Marked as applied without a tailored resume on file.';
  }
  return null;
}
