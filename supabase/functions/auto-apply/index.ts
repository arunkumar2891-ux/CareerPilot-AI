import { createUserClient, createAdminClient, jsonResponse, corsHeaders } from '../_shared/supabase-admin.ts';
import { generateText } from '../_shared/ai/router.ts';
import { sendGmailMessage } from '../_shared/gmail-send.ts';
import { getUserSettings } from '../_shared/credentials.ts';
import { GoogleAuthError } from '../_shared/credentials.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

const MAX_APPLY_PER_REQUEST = 15;

interface ApplyResult {
  jobId: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  messageId?: string;
}

async function composeApplyEmail(
  userId: string,
  opts: {
    jobTitle: string;
    company: string;
    jobDescription: string;
    resumeText: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  },
): Promise<{ subject: string; body: string }> {
  const raw = await generateText(
    {
      operation: 'chat',
      systemPrompt: [
        'You are a professional job applicant writing a concise application email.',
        'Write a short, personalized email to apply for the job described below.',
        'Rules:',
        '- Subject line: "Application: [Role] — [Your Name]" format',
        '- Keep body under 150 words',
        '- Mention 1-2 specific qualifications from the resume that match the job',
        '- Professional but human tone — no AI clichés',
        '- End with a clear call to action (e.g., "I would welcome the opportunity to discuss further")',
        '- Sign off with the applicant name',
        '- Return JSON only: { "subject": "...", "body": "..." }',
      ].join('\n'),
      userPrompt: [
        `Job Title: ${opts.jobTitle}`,
        `Company: ${opts.company}`,
        `Job Description (excerpt):\n${opts.jobDescription.slice(0, 3000)}`,
        `Applicant Name: ${opts.contactName}`,
        `Applicant Email: ${opts.contactEmail}`,
        opts.contactPhone ? `Applicant Phone: ${opts.contactPhone}` : '',
        `Resume Summary (excerpt):\n${opts.resumeText.slice(0, 2000)}`,
      ].filter(Boolean).join('\n\n'),
    },
    { userId },
  );

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0].replace(/```json\n?|\n?```/g, ''));
      return {
        subject: String(parsed.subject || `Application: ${opts.jobTitle} — ${opts.contactName}`),
        body: String(parsed.body || raw),
      };
    }
  } catch {
    // fall through to default
  }

  return {
    subject: `Application: ${opts.jobTitle} — ${opts.contactName}`,
    body: raw,
  };
}

async function loadContactInfo(userId: string) {
  const settings = await getUserSettings(userId);
  const contact = (settings.contact as Record<string, string> | undefined) || {};
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    fullName: String(profile?.full_name || contact.fullName || ''),
    email: String(contact.email || profile?.email || ''),
    phone: String(contact.phone || ''),
  };
}

async function loadResumePdf(
  admin: AdminClient,
  userId: string,
  jobId: string,
): Promise<{ pdfBytes: Uint8Array; fileName: string } | null> {
  const { data: resume } = await admin
    .from('resumes')
    .select('id, name, storage_path, pdf_url')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!resume?.storage_path) return null;

  const { data, error } = await admin.storage
    .from('resumes')
    .download(resume.storage_path);
  if (error || !data) return null;

  const pdfBytes = new Uint8Array(await data.arrayBuffer());
  const fileName = resume.storage_path.split('/').pop() || 'resume.pdf';
  return { pdfBytes, fileName };
}

async function loadResumeText(
  admin: AdminClient,
  userId: string,
  jobId: string,
): Promise<string> {
  const { data: resume } = await admin
    .from('resumes')
    .select('content')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return String(resume?.content || '');
}

async function recordApplication(
  admin: AdminClient,
  userId: string,
  jobId: string,
  result: { messageId: string; subject: string; body: string },
): Promise<void> {
  const { data: job } = await admin
    .from('jobs')
    .select('company, role')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  await admin
    .from('jobs')
    .update({ status: 'applied', application_status: 'submitted' })
    .eq('id', jobId)
    .eq('user_id', userId);

  const { data: app } = await admin
    .from('applications')
    .insert({
      user_id: userId,
      job_id: jobId,
      company: String(job?.company || ''),
      role: String(job?.role || ''),
      status: 'submitted',
      notes: '',
      attachments: [],
      apply_method: 'email',
      email_message_id: result.messageId,
      email_subject: result.subject,
      email_body: result.body,
    })
    .select('id')
    .single();

  if (app?.id) {
    await admin.from('application_events').insert({
      user_id: userId,
      application_id: app.id,
      type: 'submitted',
      label: 'Applied via email',
      event_date: new Date().toISOString(),
    });
  }
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
    const admin = createAdminClient();

    // Preview mode: return draft email without sending
    if (body.preview === true) {
      const jobId = String(body.jobId || '');
      if (!jobId) return jsonResponse({ error: 'jobId required' }, 400);

      const { data: job, error: jobError } = await admin
        .from('jobs')
        .select('id, company, role, description, apply_email')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (jobError) throw jobError;
      if (!job) return jsonResponse({ error: 'Job not found' }, 404);
      if (!job.apply_email) return jsonResponse({ error: 'No apply email found for this job' }, 400);

      const contact = await loadContactInfo(user.id);
      const resumeText = await loadResumeText(admin, user.id, jobId);

      const email = await composeApplyEmail(user.id, {
        jobTitle: String(job.role),
        company: String(job.company),
        jobDescription: String(job.description || ''),
        resumeText,
        contactName: contact.fullName,
        contactEmail: contact.email,
        contactPhone: contact.phone,
      });

      return jsonResponse({
        to: job.apply_email,
        subject: email.subject,
        body: email.body,
      });
    }

    // Apply mode: send emails
    const jobIds: string[] = Array.isArray(body.jobIds)
      ? body.jobIds.map((id: unknown) => String(id)).filter(Boolean)
      : body.jobId
        ? [String(body.jobId)]
        : [];
    if (jobIds.length === 0) return jsonResponse({ error: 'jobIds required' }, 400);
    if (jobIds.length > MAX_APPLY_PER_REQUEST) {
      return jsonResponse({ error: `Max ${MAX_APPLY_PER_REQUEST} jobs per request` }, 400);
    }

    const { data: jobs, error: jobsError } = await admin
      .from('jobs')
      .select('id, company, role, description, apply_email, resume_status, status')
      .eq('user_id', user.id)
      .in('id', jobIds);
    if (jobsError) throw jobsError;

    const contact = await loadContactInfo(user.id);
    const results: ApplyResult[] = [];

    for (const job of jobs || []) {
      const jobId = String(job.id);

      if (!job.apply_email) {
        results.push({ jobId, status: 'skipped', error: 'No apply email' });
        continue;
      }
      if (job.resume_status !== 'ready') {
        results.push({ jobId, status: 'skipped', error: 'Resume not ready' });
        continue;
      }
      if (job.status === 'applied') {
        results.push({ jobId, status: 'skipped', error: 'Already applied' });
        continue;
      }

      try {
        const resumeText = await loadResumeText(admin, user.id, jobId);
        const pdf = await loadResumePdf(admin, user.id, jobId);

        const email = await composeApplyEmail(user.id, {
          jobTitle: String(job.role),
          company: String(job.company),
          jobDescription: String(job.description || ''),
          resumeText,
          contactName: contact.fullName,
          contactEmail: contact.email,
          contactPhone: contact.phone,
        });

        const sendResult = await sendGmailMessage(user.id, {
          to: String(job.apply_email),
          subject: email.subject,
          body: email.body,
          attachment: pdf
            ? { fileName: pdf.fileName, contentType: 'application/pdf', data: pdf.pdfBytes }
            : undefined,
        });

        await recordApplication(admin, user.id, jobId, {
          messageId: sendResult.messageId,
          subject: email.subject,
          body: email.body,
        });

        results.push({ jobId, status: 'sent', messageId: sendResult.messageId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ jobId, status: 'failed', error: message });
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    return jsonResponse({ results, sent, failed, skipped });
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      return jsonResponse({ error: err.message, code: err.code }, 500);
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/insufficient|Gmail send permission/i.test(message)) {
      return jsonResponse({
        error: 'Gmail send permission not granted. Please reconnect Google in Integrations to enable email sending.',
        code: 'gmail_scope_missing',
      }, 403);
    }
    return jsonResponse({ error: message }, 500);
  }
});
