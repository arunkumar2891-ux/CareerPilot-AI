import type { createAdminClient } from './supabase-admin.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export function shortJobKey(jobId: string): string {
  return jobId.replace(/-/g, '').slice(0, 8);
}

export function parseTailoredJobKey(name: string): string | null {
  const match = name.trim().match(/\(([0-9a-f]{8})\)\s*$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function resumeStorageFileName(fileName: string): string {
  const base = String(fileName || 'resume.pdf').split(/[/\\]/).pop()?.trim() || 'resume.pdf';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '').replace(/^\.+/, '') || 'resume.pdf';
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

export function resumeStorageObjectPath(userId: string, fileName: string): string {
  return `${userId}/resumes/${resumeStorageFileName(fileName)}`;
}

export function storedFileNameFromOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const row = output as Record<string, unknown>;
  if (row.skipped) return '';
  const named = String(row.fileName || '').trim();
  if (named) return resumeStorageFileName(named);
  const path = String(row.storage_path || '').trim();
  if (!path) return '';
  return resumeStorageFileName(path.split('/').pop() || '');
}

export function storedFileLogMessage(fileName: string): string {
  return `Stored file: ${resumeStorageFileName(fileName)}`;
}

export function storedFileLogMessages(output: unknown): string[] {
  const items = Array.isArray(output) ? output : [output];
  const messages: string[] = [];
  for (const item of items) {
    const name = storedFileNameFromOutput(item);
    if (name) messages.push(storedFileLogMessage(name));
  }
  return messages;
}

/** `Tailored: Company Role (jobKey)` — job key keeps two postings of the same role distinct. */
export function buildTailoredResumeName(company: string, role: string, jobId?: string): string {
  const suffix = jobId ? ` (${shortJobKey(jobId)})` : '';
  const prefix = 'Tailored: ';
  const maxBase = Math.max(8, 120 - prefix.length - suffix.length);
  const base = `${company} ${role}`.replace(/\s+/g, ' ').trim().slice(0, maxBase).trim();
  return `${prefix}${base}${suffix}`;
}

export async function upsertTailoredResume(
  admin: AdminClient,
  userId: string,
  input: { jobId?: string; company: string; role: string; content: string },
): Promise<string> {
  const name = buildTailoredResumeName(input.company, input.role, input.jobId);
  const now = new Date().toISOString();

  if (input.jobId) {
    const { data: byJob } = await admin
      .from('resumes')
      .select('id')
      .eq('user_id', userId)
      .eq('job_id', input.jobId)
      .maybeSingle();
    if (byJob?.id) {
      await admin.from('resumes').update({
        name,
        content: input.content,
        updated_at: now,
      }).eq('id', byJob.id);
      return String(byJob.id);
    }
  } else {
    const { data: byName } = await admin
      .from('resumes')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle();
    if (byName?.id) {
      await admin.from('resumes').update({
        content: input.content,
        updated_at: now,
      }).eq('id', byName.id);
      return String(byName.id);
    }
  }

  const { data: created, error } = await admin.from('resumes').insert({
    user_id: userId,
    name,
    type: 'technical',
    content: input.content,
    ats_score: 0,
    job_id: input.jobId || null,
  }).select('id').single();
  if (error) throw error;
  return String(created.id);
}

export async function linkResumePdf(
  admin: AdminClient,
  resumeId: string,
  input: { storagePath: string; pdfUrl?: string },
): Promise<void> {
  const patch: Record<string, unknown> = {
    storage_path: input.storagePath,
    updated_at: new Date().toISOString(),
  };
  if (input.pdfUrl) patch.pdf_url = input.pdfUrl;
  const { error } = await admin.from('resumes').update(patch).eq('id', resumeId);
  if (error) throw error;
}

export async function markResumeDriveSync(
  admin: AdminClient,
  resumeId: string,
  driveFileId: string,
): Promise<void> {
  const { error } = await admin.from('resumes').update({
    drive_file_id: driveFileId,
    drive_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', resumeId);
  if (error) throw error;
}
