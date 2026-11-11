import type { Job, Resume } from '../types';

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

/** Same shape as the pipeline's `Tailored: Company Role (jobKey)` name. */
export function tailoredResumeDisplayName(company: string, role: string, jobId?: string): string {
  const key = String(jobId || '').replace(/-/g, '').slice(0, 8);
  const suffix = key ? ` (${key})` : '';
  const prefix = 'Tailored: ';
  const maxBase = Math.max(8, 120 - prefix.length - suffix.length);
  const base = `${company} ${role}`.replace(/\s+/g, ' ').trim().slice(0, maxBase).trim();
  return `${prefix}${base}${suffix}`;
}

/**
 * Object path inside the `resumes` bucket, taken from a Supabase signed URL.
 * Returns '' when the URL is not one of those objects, so a bad link cannot
 * be turned into a guessed path.
 */
export function storagePathFromSignedPdfUrl(pdfUrl?: string): string {
  if (!pdfUrl || pdfUrl.includes('..')) return '';
  try {
    const url = new URL(pdfUrl);
    const match = url.pathname.match(/\/object\/(?:sign|public|authenticated)\/resumes\/(.+)$/);
    if (!match?.[1]) return '';
    const path = decodeURIComponent(match[1]).replace(/^\/+/, '');
    if (!path || path.split('/').some((part) => part === '..' || part === '.')) return '';
    return path;
  } catch {
    return '';
  }
}

export interface JobPdfRow {
  id: string;
  company?: string | null;
  role?: string | null;
  pdf_url?: string | null;
  created_at?: string | null;
}

export interface ResumePdfRow {
  id: string;
  job_id?: string | null;
  name?: string | null;
  pdf_url?: string | null;
  storage_path?: string | null;
}

export interface StoredResumeCreate {
  jobId: string;
  name: string;
  pdfUrl: string;
  storagePath: string;
  company: string;
  role: string;
  createdAt: string;
}

export interface StoredResumeAttach {
  resumeId: string;
  pdfUrl: string;
  storagePath: string;
  jobId?: string;
}

/**
 * Jobs whose compiled PDF never became a Resumes-page row, and linked rows
 * that were saved before the PDF was attached.
 */
export function planStoredJobResumes(
  jobs: readonly JobPdfRow[],
  resumes: readonly ResumePdfRow[],
): { create: StoredResumeCreate[]; attach: StoredResumeAttach[] } {
  const byJob = new Map<string, ResumePdfRow[]>();
  const byName = new Map<string, ResumePdfRow>();
  for (const resume of resumes) {
    const jobId = String(resume.job_id || '').trim();
    if (jobId) {
      const list = byJob.get(jobId) || [];
      list.push(resume);
      byJob.set(jobId, list);
    }
    const name = String(resume.name || '').trim();
    if (name && !byName.has(name)) byName.set(name, resume);
  }

  const create: StoredResumeCreate[] = [];
  const attach: StoredResumeAttach[] = [];
  for (const job of jobs) {
    const pdfUrl = String(job.pdf_url || '').trim();
    if (!pdfUrl) continue;
    const storagePath = storagePathFromSignedPdfUrl(pdfUrl);
    const company = String(job.company || '').trim() || 'Company';
    const role = String(job.role || '').trim() || 'Role';
    const name = tailoredResumeDisplayName(company, role, job.id);
    const linked = byJob.get(String(job.id));
    const existing = linked?.[0] || byName.get(name);
    if (existing) {
      if (!existing.storage_path && !existing.pdf_url) {
        attach.push({
          resumeId: existing.id,
          pdfUrl,
          storagePath,
          jobId: linked?.[0] ? undefined : job.id,
        });
      }
      continue;
    }
    create.push({
      jobId: job.id,
      name,
      pdfUrl,
      storagePath,
      company,
      role,
      createdAt: job.created_at || new Date(0).toISOString(),
    });
  }
  return { create, attach };
}

export function storedPdfResumeNote(fileName: string): string {
  return `Compiled PDF: ${fileName || 'resume.pdf'}`;
}

function syntheticResumeFromStoredPdf(created: StoredResumeCreate): Resume {
  const fileName = storedPdfFileName(created.storagePath || created.pdfUrl);
  return {
    id: `stored-job:${created.jobId}`,
    name: created.name,
    type: 'technical',
    content: storedPdfResumeNote(fileName),
    atsScore: 0,
    versions: [],
    jobId: created.jobId,
    storagePath: created.storagePath || undefined,
    pdfUrl: created.pdfUrl,
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
    synthetic: true,
  };
}

/** Resumes-page list, plus a card for every stored PDF that has no row yet. */
export function jobResumesIncludingStoredPdfs(
  resumes: readonly Resume[],
  jobs: readonly JobPdfRow[],
): Resume[] {
  const plan = planStoredJobResumes(jobs, resumes.map((resume) => ({
    id: resume.id,
    job_id: resume.jobId,
    name: resume.name,
    pdf_url: resume.pdfUrl,
    storage_path: resume.storagePath,
  })));
  const next = resumes.map((resume) => ({ ...resume }));
  for (const row of plan.attach) {
    const resume = next.find((item) => item.id === row.resumeId);
    if (!resume) continue;
    if (!resume.pdfUrl) resume.pdfUrl = row.pdfUrl;
    if (!resume.storagePath && row.storagePath) resume.storagePath = row.storagePath;
    if (!resume.jobId && row.jobId) resume.jobId = row.jobId;
  }
  const added = plan.create.map(syntheticResumeFromStoredPdf);
  return [...added, ...next];
}

export function storedFileNamesFromLogs(logs: readonly { message: string }[]): string[] {
  const names: string[] = [];
  for (const log of logs) {
    const match = String(log.message || '').match(/^Stored file:\s+(.+?)\s*$/);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}
