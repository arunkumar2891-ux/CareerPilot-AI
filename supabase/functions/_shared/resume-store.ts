import type { createAdminClient } from './supabase-admin.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export function buildTailoredResumeName(company: string, role: string): string {
  return `Tailored: ${company} ${role}`.slice(0, 120);
}

export async function upsertTailoredResume(
  admin: AdminClient,
  userId: string,
  input: { jobId?: string; company: string; role: string; content: string },
): Promise<string> {
  const name = buildTailoredResumeName(input.company, input.role);
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
  }

  const { data: byName } = await admin
    .from('resumes')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle();
  if (byName?.id) {
    const patch: Record<string, unknown> = {
      content: input.content,
      updated_at: now,
    };
    if (input.jobId) patch.job_id = input.jobId;
    await admin.from('resumes').update(patch).eq('id', byName.id);
    return String(byName.id);
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
