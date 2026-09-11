export const SCORE_JOBS_CHUNK_SIZE = 8;
export const MAX_SCORE_JOBS_PER_REQUEST = 20;
export const TAILORED_RESUME_MIN_CHARS = 80;

export function parseScoreJobIds(raw: unknown): string[] {
  const listed = Array.isArray(raw) ? raw : (raw != null && String(raw).trim() ? [raw] : []);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of listed) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function chunkItems<T>(items: T[], size = SCORE_JOBS_CHUNK_SIZE): T[][] {
  const n = Number.isFinite(size) && size >= 1 ? Math.floor(size) : SCORE_JOBS_CHUNK_SIZE;
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export interface ResumeText {
  name: string;
  text: string;
}

export function resumeForJob(
  jobId: string,
  tailoredByJobId: Map<string, ResumeText>,
  master: ResumeText,
): ResumeText {
  const tailored = tailoredByJobId.get(jobId);
  if (tailored && tailored.text.trim().length >= TAILORED_RESUME_MIN_CHARS) return tailored;
  return master;
}

export function groupJobsByResumeText<T extends { id: string }>(
  jobs: T[],
  tailoredByJobId: Map<string, ResumeText>,
  master: ResumeText,
): Array<{ resumeName: string; resumeText: string; jobs: T[] }> {
  const order: string[] = [];
  const map = new Map<string, { resumeName: string; resumeText: string; jobs: T[] }>();
  for (const job of jobs) {
    const resume = resumeForJob(job.id, tailoredByJobId, master);
    const key = `${resume.name}\n${resume.text}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, { resumeName: resume.name, resumeText: resume.text, jobs: [] });
    }
    map.get(key)!.jobs.push(job);
  }
  return order.map((key) => map.get(key)!);
}
