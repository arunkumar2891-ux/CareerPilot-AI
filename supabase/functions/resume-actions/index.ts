import { createUserClient, createAdminClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { compileResumeContentToPdf } from '../_shared/resume-pdf.ts';
import { linkResumePdf, markResumeDriveSync } from '../_shared/resume-store.ts';
import { resolveDriveFolderId, resolveResumePdfFileName, uploadOrUpdateDrivePdf } from '../_shared/resume-drive.ts';
import { repairResumeSync } from '../_shared/resume-repair.ts';
import { GoogleAuthError } from '../_shared/credentials.ts';
import {
  assertSafeUploadStoragePath,
  extractResumeTextFromBytes,
  MAX_UPLOAD_BYTES,
  resolveUploadMime,
} from '../_shared/resume-parse.ts';
import { loadMasterResumeText } from '../_shared/career-corpus/load.ts';
import { scoreJobMatch, scoreJobsAgainstResume } from '../_shared/career-corpus/score.ts';
import { extractApplyEmail } from '../_shared/apply-email.ts';
import {
  chunkItems,
  groupJobsByResumeText,
  MAX_SCORE_JOBS_PER_REQUEST,
  parseScoreJobIds,
} from '../_shared/career-corpus/score-batch.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

async function persistJobMatchScore(
  admin: AdminClient,
  userId: string,
  jobId: string,
  score: number,
  source: string,
): Promise<void> {
  const { error: updateError } = await admin
    .from('jobs')
    .update({
      match_score: score,
      match_score_source: source,
    })
    .eq('id', jobId)
    .eq('user_id', userId);
  if (updateError && /match_score_source/.test(String(updateError.message))) {
    const { error: fallbackError } = await admin
      .from('jobs')
      .update({ match_score: score })
      .eq('id', jobId)
      .eq('user_id', userId);
    if (fallbackError) throw fallbackError;
  } else if (updateError) {
    throw updateError;
  }
}

function actionErrorResponse(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof GoogleAuthError ? err.code : undefined;
  return jsonResponse({ error: message, code }, status);
}

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
  const rest = match[1].trim().replace(/\s*\([0-9a-f]{8}\)\s*$/i, '').trim();
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
  templateOverride?: string,
): Promise<{ pdfBytes: Uint8Array; storagePath: string; signedUrl: string }> {
  const content = String(contentOverride || resume.content || '').trim();
  if (!content) throw new Error('Resume content is empty');

  const jobMeta = await loadJobMeta(admin, resume.job_id);
  const tailoredMeta = parseTailoredMeta(resume.name);
  const company = jobMeta.company || tailoredMeta.company;
  const role = jobMeta.role || tailoredMeta.role;

  let template = templateOverride;
  if (!template) {
    const { data: settingsRow } = await admin
      .from('user_settings')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    const settings = (settingsRow?.data as Record<string, unknown> | undefined) || {};
    const jobSearch = (settings.jobSearch as Record<string, unknown> | undefined) || {};
    template = (jobSearch.pdfTemplate as string) || 'classic';
  }

  const pdfBytes = await compileResumeContentToPdf(content, { targetCompany: company, targetRole: role, template: template as import('../_shared/resume-latex.ts').PdfTemplate });
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

      const templateOverride = body.template ? String(body.template) : undefined;
      const generated = await ensureResumePdf(admin, user.id, resume as ResumeRow, contentOverride, templateOverride);
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
        const first = errors[0];
        const authExpired = first?.error && /expired|revoked|reconnect Google/i.test(first.error);
        return jsonResponse(
          { error: first?.error || 'Drive sync failed', code: authExpired ? 'google_auth_expired' : undefined },
          500,
        );
      }

      return jsonResponse({
        results,
        errors: errors.length ? errors : undefined,
        driveFileId: results[0]?.driveFileId,
        pdfLink: results[0]?.pdfLink,
      });
    }

    if (mode === 'parse_uploaded_resume') {
      const storagePath = String(body.storagePath || '').trim();
      const fileName = String(body.fileName || storagePath.split('/').pop() || '');
      try {
        assertSafeUploadStoragePath(user.id, storagePath);
      } catch {
        return jsonResponse({ error: 'Invalid upload path' }, 400);
      }
      const mimeType = resolveUploadMime(fileName);
      if (!mimeType) return jsonResponse({ error: 'Unsupported file type. Use PDF, DOCX, MD, or TXT.' }, 400);

      try {
        const { data: blob, error: downloadError } = await admin.storage.from('resumes').download(storagePath);
        if (downloadError || !blob) {
          return jsonResponse({ error: 'Upload not found' }, 404);
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.length > MAX_UPLOAD_BYTES) {
          return jsonResponse({ error: 'File is too large (max 10 MB)' }, 400);
        }
        const text = await extractResumeTextFromBytes(bytes, mimeType);
        return jsonResponse({ text, mimeType });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not read this file';
        const safe = /too large|not a valid|not valid resume|empty|Unsupported|timed out/i.test(message)
          ? message
          : 'Could not read this file';
        return jsonResponse({ error: safe }, 400);
      } finally {
        await admin.storage.from('resumes').remove([storagePath]).catch(() => undefined);
      }
    }

    if (mode === 'repair_sync') {
      let folderId: string | undefined;
      try {
        folderId = await resolveDriveFolderId(user.id);
      } catch {
        folderId = undefined;
      }
      const result = await repairResumeSync(admin, user.id, folderId);
      return jsonResponse(result);
    }

    if (mode === 'score_job') {
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return jsonResponse({ error: 'jobId required' }, 400);

      const { data: job, error: jobError } = await admin
        .from('jobs')
        .select('id, description, role, company')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (jobError) throw jobError;
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);

      const { data: tailored } = await admin
        .from('resumes')
        .select('name, content')
        .eq('user_id', user.id)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const tailoredText = String(tailored?.content || '').trim();
      let resumeText = tailoredText;
      let resumeName = String(tailored?.name || '').trim();
      if (resumeText.length < 80) {
        const master = await loadMasterResumeText(user.id);
        resumeText = master.text;
        resumeName = master.name;
      }

      const result = await scoreJobMatch({
        jobDescription: String(job.description || ''),
        jobTitle: String(job.role || ''),
        company: String(job.company || ''),
        resumeText,
        resumeName,
        userId: user.id,
      });

      await persistJobMatchScore(admin, user.id, jobId, result.score, result.source);

      return jsonResponse({
        score: result.score,
        source: result.source,
        method: result.method,
      });
    }

    if (mode === 'score_jobs') {
      const jobIds = parseScoreJobIds(body.jobIds ?? body.jobId);
      if (!jobIds.length) return jsonResponse({ error: 'jobIds required' }, 400);
      if (jobIds.length > MAX_SCORE_JOBS_PER_REQUEST) {
        return jsonResponse({ error: `Score at most ${MAX_SCORE_JOBS_PER_REQUEST} jobs per request` }, 400);
      }

      const { data: jobRows, error: jobsError } = await admin
        .from('jobs')
        .select('id, description, role, company')
        .eq('user_id', user.id)
        .in('id', jobIds);
      if (jobsError) throw jobsError;

      const found = new Map(
        (jobRows || []).map((row) => [String(row.id), {
          id: String(row.id),
          description: String(row.description || ''),
          role: String(row.role || ''),
          company: String(row.company || ''),
        }]),
      );
      const errors: Array<{ jobId: string; error: string }> = [];
      const jobs = jobIds.map((id) => found.get(id)).filter((job): job is {
        id: string;
        description: string;
        role: string;
        company: string;
      } => Boolean(job));
      for (const id of jobIds) {
        if (!found.has(id)) errors.push({ jobId: id, error: 'Job not found' });
      }

      const { data: tailoredRows, error: tailoredError } = jobs.length
        ? await admin
          .from('resumes')
          .select('job_id, name, content, created_at')
          .eq('user_id', user.id)
          .in('job_id', jobs.map((job) => job.id))
          .order('created_at', { ascending: false })
        : { data: [], error: null };
      if (tailoredError) throw tailoredError;

      const tailoredByJobId = new Map<string, { name: string; text: string }>();
      for (const row of tailoredRows || []) {
        const jobId = String(row.job_id || '');
        if (!jobId || tailoredByJobId.has(jobId)) continue;
        tailoredByJobId.set(jobId, {
          name: String(row.name || 'Resume'),
          text: String(row.content || '').trim(),
        });
      }

      const master = await loadMasterResumeText(user.id);
      const groups = groupJobsByResumeText(jobs, tailoredByJobId, {
        name: master.name,
        text: master.text,
      });
      const results: Array<{ jobId: string; score: number; source: string; method?: string }> = [];

      for (const group of groups) {
        for (const slice of chunkItems(group.jobs)) {
          const scored = await scoreJobsAgainstResume({
            jobs: slice.map((job) => ({
              jobDescription: job.description,
              jobTitle: job.role,
              company: job.company,
            })),
            resumeText: group.resumeText,
            resumeName: group.resumeName,
            userId: user.id,
          });
          for (let i = 0; i < slice.length; i++) {
            const job = slice[i];
            const result = scored[i] || { score: 0, source: group.resumeName, method: 'lexical' as const };
            try {
              await persistJobMatchScore(admin, user.id, job.id, result.score, result.source);
              results.push({
                jobId: job.id,
                score: result.score,
                source: result.source,
                method: result.method,
              });
            } catch (err) {
              errors.push({
                jobId: job.id,
                error: err instanceof Error ? err.message : 'Failed to save score',
              });
            }
          }
        }
      }

      return jsonResponse({
        results,
        errors: errors.length ? errors : undefined,
        scored: results.length,
        failed: errors.length,
      });
    }

    if (mode === 'interview_prep') {
      const jobId = String(body.jobId || '').trim();
      if (!jobId) return jsonResponse({ error: 'jobId required' }, 400);

      const { data: job, error: jobError } = await admin
        .from('jobs')
        .select('id, description, role, company')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (jobError) throw jobError;
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);

      const { data: tailored } = await admin
        .from('resumes')
        .select('name, content')
        .eq('user_id', user.id)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const resumeText = String(tailored?.content || '').trim();

      const prompt = [
        `Given this job description and tailored resume, generate interview preparation notes.`,
        `Return JSON only with these keys: talkingPoints (string[]), technicalQuestions (string[]), behavioralQuestions (string[]), questionsToAsk (string[]), researchNotes (string).`,
        `Job: ${job.role} at ${job.company}`,
        `Job Description:\n${String(job.description || '').slice(0, 4000)}`,
        resumeText ? `Tailored Resume:\n${resumeText.slice(0, 4000)}` : 'No tailored resume available — use general best practices.',
      ].join('\n\n');

      const { generateText } = await import('../_shared/ai/router.ts');
      const raw = await generateText({
        operation: 'cover_letter',
        systemPrompt: 'You are an expert interview coach. Return valid JSON only. No markdown.',
        userPrompt: prompt,
      }, { userId: user.id });

      let prep: Record<string, unknown> = {};
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) prep = JSON.parse(jsonMatch[0].replace(/```json\n?|\n?```/g, ''));
      } catch {
        prep = { researchNotes: raw.slice(0, 2000) };
      }

      const result = {
        talkingPoints: Array.isArray(prep.talkingPoints) ? prep.talkingPoints.map(String) : [],
        technicalQuestions: Array.isArray(prep.technicalQuestions) ? prep.technicalQuestions.map(String) : [],
        behavioralQuestions: Array.isArray(prep.behavioralQuestions) ? prep.behavioralQuestions.map(String) : [],
        questionsToAsk: Array.isArray(prep.questionsToAsk) ? prep.questionsToAsk.map(String) : [],
        researchNotes: String(prep.researchNotes || ''),
        generatedAt: new Date().toISOString(),
      };

      await admin
        .from('jobs')
        .update({ interview_prep: result })
        .eq('id', jobId)
        .eq('user_id', user.id);

      return jsonResponse({ prep: result });
    }

    if (mode === 'extract_apply_emails') {
      const jobIds: string[] = Array.isArray(body.jobIds)
        ? body.jobIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];

      let query = admin
        .from('jobs')
        .select('id, description, company')
        .eq('user_id', user.id)
        .is('apply_email', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (jobIds.length > 0) query = query.in('id', jobIds);

      const { data: jobs, error: jobsError } = await query;
      if (jobsError) throw jobsError;

      let extracted = 0;
      const total = (jobs || []).length;
      const errors: string[] = [];

      for (const job of jobs || []) {
        try {
          const result = await extractApplyEmail(
            String(job.description || ''),
            String(job.company || ''),
            user.id,
          );
          if (result.email) {
            const { error: updateError } = await admin
              .from('jobs')
              .update({
                apply_email: result.email,
                apply_email_source: 'extracted',
              })
              .eq('id', job.id)
              .eq('user_id', user.id);
            if (updateError) throw updateError;
            extracted++;
          }
        } catch (err) {
          errors.push(`${job.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return jsonResponse({ extracted, total, errors: errors.length ? errors : undefined });
    }

    return jsonResponse({ error: 'Unknown mode' }, 400);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return actionErrorResponse(err);
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/expired|revoked|invalid_grant/i.test(message)) {
      return jsonResponse({
        error: 'Google Drive connection expired or was revoked. Open Integrations, reconnect Google Drive, then retry.',
        code: 'google_auth_expired',
      }, 500);
    }
    return jsonResponse({ error: message }, 500);
  }
});
