import type { Job } from '../types';

/**
 * What the Jobs board can show after tailoring.
 *
 * The pipeline writes two different records: a `resumes` row (`resumeId`) and
 * the compiled PDF (`pdfUrl` on the job, `storagePath` on the resume). The
 * board used to treat "no resume row" as "no resume", so a job could sit in
 * Resume Ready with a stored PDF and still read as missing.
 */
export interface JobResumeView {
  /** A tailored resume row or a stored PDF exists. */
  show: boolean;
  /** A `resumes` row is linked to this job. */
  linked: boolean;
  /** The compiled PDF can be opened without generating it again. */
  canOpenStoredPdf: boolean;
  /** Status says ready, but neither a resume row nor a PDF is attached. */
  missing: boolean;
}

export function describeJobResume(
  job: Pick<Job, 'resumeId' | 'pdfUrl' | 'resumeStoragePath' | 'resumeStatus'>,
): JobResumeView {
  const linked = Boolean(job.resumeId);
  const canOpenStoredPdf = Boolean(job.resumeStoragePath || job.pdfUrl);
  const show = linked || canOpenStoredPdf;
  return {
    show,
    linked,
    canOpenStoredPdf,
    missing: !show && job.resumeStatus === 'ready',
  };
}

/** Prefer the copy that actually has the compiled PDF when a job has more than one resume row. */
export interface LinkedResumeRow {
  id: string;
  job_id?: string | null;
  name?: string | null;
  drive_file_id?: string | null;
  pdf_url?: string | null;
  storage_path?: string | null;
}

export function pickResumeForJob(rows: readonly LinkedResumeRow[]): Map<string, LinkedResumeRow> {
  const map = new Map<string, LinkedResumeRow>();
  for (const row of rows) {
    const key = String(row.job_id || '').trim();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    const prevHasPdf = Boolean(prev.storage_path || prev.pdf_url);
    const nextHasPdf = Boolean(row.storage_path || row.pdf_url);
    if (!prevHasPdf && nextHasPdf) map.set(key, row);
  }
  return map;
}

/** File name from a storage path or a signed URL. Returns '' when it is not a PDF name. */
export function storedPdfFileName(source?: string): string {
  if (!source) return '';
  const path = source.split('?')[0].split('#')[0];
  let base = path.split('/').pop() || '';
  try {
    base = decodeURIComponent(base);
  } catch {
    /* keep the raw segment */
  }
  base = base.trim();
  return /\.pdf$/i.test(base) ? base : '';
}

export function storedFileNamesFromLogs(logs: readonly { message: string }[]): string[] {
  const names: string[] = [];
  for (const log of logs) {
    const match = String(log.message || '').match(/^Stored file:\s+(.+?)\s*$/);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}
