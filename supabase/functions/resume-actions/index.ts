import { createUserClient, createAdminClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { compileResumeContentToPdf } from '../_shared/resume-pdf.ts';
import { linkResumePdf, markResumeDriveSync } from '../_shared/resume-store.ts';
import { resolveDriveFolderId, resolveResumePdfFileName, uploadOrUpdateDrivePdf } from '../_shared/resume-drive.ts';

type ResumeRow = {
  id: string;
  user_id: string;
  name: string;
  content: string;
  job_id?: string | null;
  drive_file_id?: string | null;
  storage_path?: string | null;
  pdf_url?: string | null;
};

function parseTailoredMeta(name: string): { company: string; role: string } {
  const match = name.match(/^Tailored:\s*(.+)$/i);
  if (!match) return { company: 'Company', role: name || 'Role' };
  const rest = match[1].trim();
  const slash = rest.indexOf(' / ');
  if (slash > 0) {
    return { company: rest.slice(0, slash).trim(), role: rest.slice(slash + 3).trim() };
  }
  const parts = rest.split(/\s+/);
  if (parts.length >= 2) {
    return { company: parts[0], role: parts.slice(1).join(' ') };
  }
  return { company: rest || 'Company', role: 'Role' };
}

async function loadJobMeta(admin: ReturnType<typeof createAdminClient>, jobId?: string | null) {
  if (!jobId) return { company: '', role: '' };
  const { data } = await admin.from('jobs').select('company, role').eq('id', jobId).maybeSingle();
  return {
    company: String(data?.company || ''),
    role: String(data?.role || ''),
  };
}

async function ensureResumePdf(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  resume: ResumeRow,
  contentOverride?: string,
): Promise<{ pdfBytes: Uint8Array; storagePath: string; signedUrl: string }> {
  const content = String(contentOverride || resume.content || '').trim();
  if (!content) throw new Error('Resume content is empty');

  const jobMeta = await loadJobMeta(admin, resume.job_id);
  const tailoredMeta = parseTailoredMeta(resume.name);
  const company = jobMeta.company || tailoredMeta.company;
  const role = jobMeta.role || tailoredMeta.role;

  const pdfBytes = await compileResumeContentToPdf(content, { targetCompany: company, targetRole: role });
  const storagePath = resume.storage_path || `${userId}/resumes/${resume.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from('resumes')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;

  const { data: signed, error: signError } = await admin.storage
    .from('resumes')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (signError || !signed?.signedUrl) throw signError || new Error('Failed to create signed PDF URL');

  await linkResumePdf(admin, resume.id, { storagePath, pdfUrl: signed.signedUrl });
  return { pdfBytes, storagePath, signedUrl: signed.signedUrl };
}

async function loadPdfBytes(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  resume: ResumeRow,
  contentOverride?: string,
): Promise<Uint8Array> {
  if (resume.storage_path) {
    const { data, error } = await admin.storage.from('resumes').download(resume.storage_path);
    if (!error && data) {
      return new Uint8Array(await data.arrayBuffer());
    }
  }
  const generated = await ensureResumePdf(admin, userId, resume, contentOverride);
  return generated.pdfBytes;
}

async function syncResumeToDrive(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  resumeId: string,
  contentOverride?: string,
) {
  const { data: resume, error } = await admin
    .from('resumes')
    .select('id, user_id, name, content, job_id, drive_file_id, storage_path, pdf_url')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!resume) throw new Error('Resume not found');

  if (contentOverride && contentOverride !== resume.content) {
    await admin.from('resumes').update({
      content: contentOverride,
      updated_at: new Date().toISOString(),
    }).eq('id', resumeId);
    resume.content = contentOverride;
  }

  const pdfBytes = await loadPdfBytes(admin, userId, resume as ResumeRow, contentOverride);
  const jobMeta = await loadJobMeta(admin, resume.job_id);
  const tailoredMeta = parseTailoredMeta(resume.name);
  const folderId = await resolveDriveFolderId(userId);
  const fileName = await resolveResumePdfFileName(userId, {
    company: jobMeta.company || tailoredMeta.company,
    role: jobMeta.role || tailoredMeta.role,
    resumeName: resume.name,
  });

  const drive = await uploadOrUpdateDrivePdf(userId, {
    pdfBytes,
    fileName,
    folderId,
    existingFileId: resume.drive_file_id,
  });
  await markResumeDriveSync(admin, resumeId, drive.fileId);
  return {
    resumeId,
    driveFileId: drive.fileId,
    pdfLink: drive.pdfLink,
    fileName: drive.fileName,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createUserClient(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const mode = String(body.mode || '');
    const admin = createAdminClient();

    if (mode === 'generate_pdf') {
      const resumeId = String(body.resumeId || '');
      if (!resumeId) return jsonResponse({ error: 'resumeId required' }, 400);

      const { data: resume, error } = await admin
        .from('resumes')
        .select('id, user_id, name, content, job_id, storage_path')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!resume) return jsonResponse({ error: 'Resume not found' }, 404);

      const contentOverride = body.content ? String(body.content) : undefined;
      if (contentOverride && contentOverride !== resume.content) {
        await admin.from('resumes').update({
          content: contentOverride,
          updated_at: new Date().toISOString(),
        }).eq('id', resumeId);
        resume.content = contentOverride;
      }

      const generated = await ensureResumePdf(admin, user.id, resume as ResumeRow, contentOverride);
      return jsonResponse({
        url: generated.signedUrl,
        storagePath: generated.storagePath,
        resumeId,
      });
    }

    if (mode === 'sync_drive') {
      const resumeIds = Array.isArray(body.resumeIds)
        ? body.resumeIds.map((id: unknown) => String(id)).filter(Boolean)
        : body.resumeId
          ? [String(body.resumeId)]
          : [];
      if (resumeIds.length === 0) return jsonResponse({ error: 'resumeId or resumeIds required' }, 400);

      const contentOverride = body.content ? String(body.content) : undefined;
      const results = [];
      const errors: { resumeId: string; error: string }[] = [];

      for (const resumeId of resumeIds) {
        try {
          const result = await syncResumeToDrive(
            admin,
            user.id,
            resumeId,
            resumeIds.length === 1 ? contentOverride : undefined,
          );
          results.push(result);
        } catch (err) {
          errors.push({
            resumeId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (results.length === 0) {
        return jsonResponse({ error: errors[0]?.error || 'Drive sync failed' }, 500);
      }

      return jsonResponse({
        results,
        errors: errors.length ? errors : undefined,
        driveFileId: results[0]?.driveFileId,
        pdfLink: results[0]?.pdfLink,
      });
    }

    return jsonResponse({ error: 'Unknown mode' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
