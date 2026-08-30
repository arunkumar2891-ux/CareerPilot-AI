import type { NodeExecutor, NodeResult, RunContext, WorkflowNodeRow, WorkflowEdgeRow } from './types.ts';
import { getSecretOrIntegration, getIntegrationCredentials, refreshGoogleToken, getUserSettings } from '../credentials.ts';
import { resolveTemplate } from './graph.ts';
import { createAdminClient } from '../supabase-admin.ts';
import { ATS_SYSTEM_PROMPT, buildResumeUserPrompt } from '../career-corpus/prompt.ts';
import { loadCareerCorpus } from '../career-corpus/load.ts';
import { syncGoogleDocToCorpus } from '../google-doc-sync.ts';
import { flattenJobItems, normalizeLinkedInJobUrl, buildLinkedInJobSearchUrl, inferJobWorkplace, postedWithinCutoffIso } from '../job-url.ts';
import { geminiGenerateContentUrl, callGeminiGenerateContent } from '../gemini.ts';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(li|p|div|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  return await callGeminiGenerateContent(systemPrompt, userPrompt);
}

export const nodeExecutors: Record<string, NodeExecutor> = {
  schedule: {
    async execute(ctx, node) {
      return { output: { scheduled: node.config.cron || '0 7 * * *' }, status: 'success' };
    },
  },
  trigger: {
    async execute(_ctx, node) {
      return { output: { triggered: true, ...node.config }, status: 'success' };
    },
  },
  webhook: {
    async execute(_ctx, node) {
      return { output: { webhook: node.config.path }, status: 'success' };
    },
  },
  transform: {
    async execute(ctx, node, input) {
      const action = node.config.action as string;
      if (action === 'build_linkedin_url') {
        const jobSearch = (ctx.settings.jobSearch as Record<string, string>) || {};
        const query = node.config.query as string || jobSearch.query || 'Software Engineer';
        const location = node.config.location as string || jobSearch.location || 'United States';
        const linkedinUrl = buildLinkedInJobSearchUrl(query, location, jobSearch.postedWithin);
        return { output: { linkedinUrl, query, location, postedWithin: jobSearch.postedWithin || '1d' }, status: 'success' };
      }
      if (action === 'limit') {
        const items = Array.isArray(input) ? input : (Array.isArray(ctx.items) ? ctx.items : [input]);
        const jobSearch = (ctx.settings.jobSearch as Record<string, string>) || {};
        const max = Number(jobSearch.maxJobs || node.config.max || 5);
        return { output: items.slice(0, max), status: 'success' };
      }
      if (action === 'merge_job_data') {
        const jobData = input as Record<string, unknown>;
        const agentOutput = ctx.nodeOutputs[node.config.agentNodeId as string] || ctx.variables.lastAgentOutput;
        return { output: { ...jobData, output: agentOutput }, status: 'success' };
      }
      return { output: input, status: 'success' };
    },
  },
  function: {
    async execute(ctx, node, input) {
      const fn = node.config.builtin as string;
      if (fn === 'parse_apify_jobs') {
        const rawItems: Record<string, unknown>[] = [];
        if (Array.isArray(input)) {
          for (const item of input) {
            if (item && typeof item === 'object') rawItems.push(item as Record<string, unknown>);
          }
        } else if (input && typeof input === 'object') {
          const wrapped = input as Record<string, unknown>;
          if (Array.isArray(wrapped.items)) {
            for (const item of wrapped.items) {
              if (item && typeof item === 'object') rawItems.push(item as Record<string, unknown>);
            }
          } else {
            rawItems.push(wrapped);
          }
        }
        const jobs: Record<string, unknown>[] = [];
        const seen = new Set<string>();
        const jobSearch = (ctx.settings.jobSearch as Record<string, string>) || {};
        const postedCutoff = postedWithinCutoffIso(jobSearch.postedWithin);
        ctx.variables.jobsScraped = rawItems.length;
        for (const j of rawItems) {
          const jobLink = normalizeLinkedInJobUrl(String(j.link || j.jobUrl || j.url || ''));
          if (seen.has(jobLink) || !jobLink) continue;
          const postedAt = String(j.postedAt || '');
          if (postedCutoff && /^\d{4}-\d{2}-\d{2}/.test(postedAt) && postedAt < postedCutoff) continue;
          let jobDescription = j.descriptionHtml
            ? stripHtml(String(j.descriptionHtml))
            : String(j.descriptionText || j.description || '');
          if (jobDescription.length < 50) {
            const fallback = [
              j.title,
              j.companyName || j.company,
              j.location,
              j.seniorityLevel,
              j.employmentType,
              j.jobFunction,
              j.industries,
            ]
              .map((p) => String(p || '').trim())
              .filter(Boolean)
              .join('. ');
            if (fallback.length >= 20) jobDescription = fallback;
          }
          if (!jobDescription || jobDescription.length < 20) continue;
          jobs.push({
            title: j.title || 'No Title',
            company: j.companyName || j.company || 'Unknown Company',
            location: j.location || 'Unknown Location',
            postedAt,
            employmentType: j.employmentType || '',
            seniorityLevel: j.seniorityLevel || '',
            workplaceType: j.workplaceType || j.workType || j.jobBenefits || '',
            jobLink,
            jobDescription,
          });
          seen.add(jobLink);
          if (jobs.length >= 20) break;
        }
        ctx.variables.jobsParsed = jobs.length;
        return { output: jobs, status: 'success' };
      }
      if (fn === 'build_latex') {
        const data = input as Record<string, unknown>;
        const raw = String(data.output ?? '').trim();
        const latex = buildLatex(raw);
        return { output: { ...data, latex }, status: 'success' };
      }
      if (fn === 'email_summary') {
        const items = (ctx.variables.processedJobs as Record<string, unknown>[]) || [];
        const scraped = Number(ctx.variables.jobsScraped ?? 0);
        const parsed = Number(ctx.variables.jobsParsed ?? 0);
        const afterDedupe = Number(ctx.variables.jobsAfterDedupe ?? 0);
        const skippedDuplicate = Number(ctx.variables.jobsSkippedDuplicate ?? 0);
        const skippedNoLink = Number(ctx.variables.jobsSkippedNoLink ?? 0);
        if (items.length === 0) {
          const email = (ctx.settings.notifications as Record<string, string>)?.email || ctx.settings.userEmail;
          const today = new Date().toISOString().slice(0, 10);
          let detail = 'No new resumes were generated today.';
          if (scraped === 0) {
            detail = 'Apify returned no job listings for your LinkedIn search URL. Try broadening location or keywords in Settings.';
          } else if (parsed === 0) {
            detail = `Apify returned ${scraped} listings but none could be parsed into jobs (missing descriptions or links).`;
          } else if (afterDedupe === 0 && skippedDuplicate > 0) {
            detail = `All ${skippedDuplicate} new job(s) were already in your jobs table — no new listings to process.`;
          } else if (afterDedupe === 0 && skippedNoLink > 0) {
            detail = `${skippedNoLink} parsed job(s) could not be processed because the job URL was missing.`;
          } else if (afterDedupe === 0) {
            detail = `${parsed} job(s) were parsed but none were queued for tailoring.`;
          }
          return {
            output: {
              subject: `No New Jobs Found — ${today}`,
              body: `<p>${detail}</p>`,
              to: email,
            },
            status: 'success',
          };
        }
        const today = new Date().toISOString().slice(0, 10);
        let body = `<div style="font-family:Arial,sans-serif"><h2>Your ATS resumes are ready (${items.length})</h2><table border="1" cellpadding="8"><tr><th>Company</th><th>Role</th><th>Job</th><th>Resume</th></tr>`;
        for (const it of items) {
          if (!it || typeof it !== 'object') continue;
          const row = it as Record<string, unknown>;
          body += `<tr><td>${row.company ?? ''}</td><td>${row.roleName || row.title}</td><td><a href="${row.jobLink}">View</a></td><td><a href="${row.pdfLink || row.pdf_url}">PDF</a></td></tr>`;
        }
        body += `</table><p>Generated: ${new Date().toLocaleString()}</p></div>`;
        const email = (ctx.settings.notifications as Record<string, string>)?.email || ctx.settings.userEmail;
        return { output: { subject: `ATS Resumes Ready (${items.length}) — ${today}`, body, to: email }, status: 'success' };
      }
      return { output: input, status: 'success' };
    },
  },
  apify: {
    async execute(ctx, node, input) {
      const action = node.config.action as string || 'start_run';
      const creds = await getIntegrationCredentials(ctx.userId, 'Apify');
      const token = getSecretOrIntegration('APIFY_TOKEN', creds);
      if (!token) throw new Error('APIFY_TOKEN not configured');
      const actorId = String(node.config.actorId || 'curious_coder~linkedin-jobs-scraper');

      if (action === 'start_run') {
        let linkedinUrl = (input as Record<string, unknown>)?.linkedinUrl as string | undefined;
        if (!linkedinUrl) {
          for (const out of Object.values(ctx.nodeOutputs)) {
            const o = out as Record<string, unknown>;
            if (o?.linkedinUrl) { linkedinUrl = String(o.linkedinUrl); break; }
          }
        }
        const jobSearch = (ctx.settings.jobSearch as Record<string, string>) || {};
        const scrapeLimit = Number(
          jobSearch.maxJobs || (node.config.limitPerSource ?? node.config.count ?? 10),
        );
        const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: [linkedinUrl],
            scrapeCompany: true,
            autoConvertToAiSearch: true,
            limitPerSource: scrapeLimit,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || 'Apify start failed');
        ctx.variables.apifyRunId = json.data.id;
        ctx.variables.apifyDatasetId = json.data.defaultDatasetId;
        return { output: json.data, status: 'success' };
      }
      if (action === 'check_status') {
        const runId = ctx.variables.apifyRunId as string;
        const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${token}`);
        const json = await res.json();
        const status = json.data?.status;
        if (status === 'SUCCEEDED') return { output: json.data, status: 'success', route: 'true' };
        if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Apify run ${status}`);
        return { output: json.data, status: 'waiting', resumeAt: new Date(Date.now() + 10000) };
      }
      if (action === 'fetch_dataset') {
        const datasetId = ctx.variables.apifyDatasetId as string;
        const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
        const items = await res.json();
        return { output: items, status: 'success' };
      }
      return { output: input, status: 'success' };
    },
  },
  wait: {
    async execute(_ctx, node) {
      const seconds = Number(node.config.seconds ?? 10);
      return { output: { waited: seconds }, status: 'waiting', resumeAt: new Date(Date.now() + seconds * 1000) };
    },
  },
  condition: {
    async execute(_ctx, node, input) {
      const field = node.config.field as string;
      const operator = node.config.operator as string || 'equals';
      const expected = node.config.value;
      const actual = field ? (input as Record<string, unknown>)?.[field] : input;
      let result = false;
      if (operator === 'equals') result = actual === expected;
      else if (operator === 'not_equals') result = actual !== expected;
      else if (operator === 'truthy') result = Boolean(actual);
      return { output: { result, actual }, status: 'success', route: result ? 'true' : 'false' };
    },
  },
  merge: {
    async execute(ctx, node, input) {
      const sources = (node.config.sources as string[]) || [];
      const merged: Record<string, unknown> = {};
      for (const s of sources) merged[s] = ctx.nodeOutputs[s];
      if (input && typeof input === 'object') Object.assign(merged, input as Record<string, unknown>);
      return { output: merged, status: 'success' };
    },
  },
  duplicate_checker: {
    async execute(ctx, _node, input) {
      const items = flattenJobItems(input);
      const admin = createAdminClient();
      const newItems: unknown[] = [];
      let skippedNoLink = 0;
      let skippedDuplicate = 0;
      for (const item of items) {
        const row = item as Record<string, unknown>;
        const jobLink = normalizeLinkedInJobUrl(String(row.jobLink || row.link || row.url || row.jobUrl || ''));
        if (!jobLink) {
          skippedNoLink++;
          continue;
        }
        row.jobLink = jobLink;
        const { data } = await admin.from('jobs').select('id').eq('user_id', ctx.userId).eq('url', jobLink).maybeSingle();
        if (data) {
          skippedDuplicate++;
          continue;
        }
        newItems.push(row);
      }
      ctx.variables.jobsAfterDedupe = newItems.length;
      ctx.variables.jobsSkippedDuplicate = skippedDuplicate;
      ctx.variables.jobsSkippedNoLink = skippedNoLink;
      return { output: newItems, status: 'success' };
    },
  },
  gdocs: {
    async execute(ctx, node) {
      const fileId = resolveTemplate(String(node.config.fileId || ''), ctx).trim();
      if (!fileId || fileId.includes('{{') || fileId.includes('YOUR_GOOGLE')) {
        return { output: { skipped: true, reason: 'no_google_doc' }, status: 'success' };
      }
      try {
        const sync = await syncGoogleDocToCorpus(ctx.userId, fileId);
        ctx.variables.googleHeader = sync.docContent.split('\n').slice(0, 12).join('\n');
        ctx.variables.googleDocSynced = true;
        return {
          output: {
            docId: fileId,
            synced: true,
            chunksExtracted: sync.chunksExtracted,
            newChunksAdded: sync.newChunksAdded,
            resumeUpdated: sync.resumeUpdated,
          },
          status: 'success',
        };
      } catch (err) {
        ctx.variables.googleDocWarning = err instanceof Error ? err.message : String(err);
        return { output: { skipped: true, reason: 'google_doc_optional' }, status: 'success' };
      }
    },
  },
  gdrive: {
    async execute(ctx, node, input) {
      const action = node.config.action as string || 'download';
      const accessToken = await refreshGoogleToken(ctx.userId);
      if (action === 'upload') {
        const data = input as Record<string, unknown>;
        const pdfBytes = data.pdfBytes as Uint8Array;
        const fileName = String(data.docTitle || data.title || 'resume') + '.pdf';
        const metadata = { name: fileName, mimeType: 'application/pdf' };
        const boundary = 'careerpilot_boundary';
        const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
        const enc = new TextEncoder();
        const part1 = enc.encode(body);
        const part2 = enc.encode(`\r\n--${boundary}--`);
        const full = new Uint8Array(part1.length + (pdfBytes?.length || 0) + part2.length);
        full.set(part1);
        if (pdfBytes) full.set(pdfBytes, part1.length);
        full.set(part2, part1.length + (pdfBytes?.length || 0));
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: full,
        });
        const file = await res.json();
        if (!res.ok) throw new Error(file.error?.message || 'Drive upload failed');
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        });
        const pdfLink = `https://drive.google.com/file/d/${file.id}/view`;
        const processed = (ctx.variables.processedJobs as Record<string, unknown>[]) || [];
        processed.push({ ...data, pdfLink, pdf_url: pdfLink });
        ctx.variables.processedJobs = processed;
        return { output: { ...data, id: file.id, pdfLink }, status: 'success' };
      }
      return { output: input, status: 'success' };
    },
  },
  gemini: {
    async execute(ctx, node, input) {
      const systemPrompt = String(node.config.systemPrompt || ATS_SYSTEM_PROMPT);
      const job = (input && typeof input === 'object' ? input : ctx.variables.currentItem) as Record<string, unknown> | undefined;
      if (!job) {
        return { output: { skipped: true, reason: 'no_job_input' }, status: 'success' };
      }
      const jd = String(job.jobDescription || job.description || '');
      const corpus = await loadCareerCorpus(ctx.userId, jd);
      const userPrompt = buildResumeUserPrompt({
        jobTitle: String(job.title || job.role || ''),
        company: String(job.company || job.companyName || ''),
        jobDescription: jd,
        playbookTitle: corpus.playbookTitle,
        playbookInstructions: corpus.playbookInstructions,
        masterResume: corpus.masterResume,
        twoPageTemplate: corpus.twoPageTemplate,
        evidence: corpus.evidence,
        contactBlock: corpus.contactBlock,
        googleHeader: String(ctx.variables.googleHeader || ''),
      });
      const output = await callGemini(systemPrompt, userPrompt);
      ctx.variables.lastAgentOutput = output;
      ctx.variables.playbook = corpus.playbookTitle;
      return { output: { ...job, output }, status: 'success' };
    },
  },
  resume_optimizer: {
    async execute(ctx, node, input) {
      return nodeExecutors.gemini.execute(ctx, { ...node, type: 'gemini' }, input);
    },
  },
  supabase: {
    async execute(ctx, node, input) {
      const action = node.config.action as string || 'insert_job';
      const admin = createAdminClient();
      if (action === 'insert_job') {
        if (input == null || typeof input !== 'object') {
          return { output: input ?? { skipped: true }, status: 'success' };
        }
        const job = input as Record<string, unknown>;
        if (job.skipped) {
          return { output: job, status: 'success' };
        }
        const workplace = inferJobWorkplace(
          String(job.location || ''),
          String(job.employmentType || ''),
          String(job.workplaceType || ''),
        );
        const row = {
          user_id: ctx.userId,
          company: String(job.company ?? job.companyName ?? ''),
          role: String(job.title ?? job.role ?? ''),
          description: String(job.jobDescription ?? job.description ?? ''),
          match_score: 0,
          skills: [],
          posting_date: job.postedAt || new Date().toISOString(),
          source: 'linkedin/apify',
          location: String(job.location || ''),
          remote: workplace.remote,
          hybrid: workplace.hybrid,
          experience: String(job.seniorityLevel || ''),
          duplicate: false,
          resume_status: 'ready',
          application_status: 'draft',
          status: 'resume_ready',
          url: normalizeLinkedInJobUrl(String(job.jobLink || job.url || job.link || '')),
        };
        const { data, error } = await admin.from('jobs').insert(row).select().single();
        if (error) throw error;
        ctx.variables.lastJobId = data.id;
        return { output: { ...job, jobId: data.id }, status: 'success' };
      }
      return { output: input, status: 'success' };
    },
  },
  pdf: {
    async execute(_ctx, node, input) {
      const data = input as Record<string, unknown>;
      const latex = String(data.latex || '');
      const compilerUrl = Deno.env.get('LATEX_COMPILER_URL') || 'https://latex.ytotech.com/builds/sync';
      const res = await fetch(compilerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compiler: 'lualatex', resources: [{ main: true, content: latex }] }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`LaTeX compile failed: ${err.slice(0, 200)}`);
      }
      const pdfBytes = new Uint8Array(await res.arrayBuffer());
      return { output: { ...data, pdfBytes, docTitle: data.title || data.role }, status: 'success' };
    },
  },
  storage: {
    async execute(ctx, node, input) {
      const data = input as Record<string, unknown>;
      const pdfBytes = data.pdfBytes as Uint8Array;
      if (!pdfBytes) return { output: data, status: 'success' };
      const admin = createAdminClient();
      const path = `${ctx.userId}/${data.jobId || Date.now()}.pdf`;
      const { error } = await admin.storage.from('resumes').upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (error) throw error;
      const { data: urlData } = admin.storage.from('resumes').getPublicUrl(path);
      await admin.from('documents').insert({
        user_id: ctx.userId,
        name: String(data.docTitle || 'resume') + '.pdf',
        type: 'pdf',
        size: pdfBytes.length,
        folder: 'resumes',
        tags: ['generated'],
        storage_path: path,
      });
      if (data.jobId) {
        await admin.from('jobs').update({ pdf_url: urlData.publicUrl, resume_status: 'ready' }).eq('id', data.jobId);
      }
      return { output: { ...data, pdf_url: urlData.publicUrl, storage_path: path }, status: 'success' };
    },
  },
  email: {
    async execute(ctx, node, input) {
      let payload = input;
      if (Array.isArray(payload)) {
        payload = payload.find((item) => item && typeof item === 'object') ?? payload[0];
      }
      const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
      const to = String(data.to || (ctx.settings.notifications as Record<string, string>)?.email || ctx.settings.userEmail || '');
      const today = new Date().toISOString().slice(0, 10);
      const processed = (ctx.variables.processedJobs as Record<string, unknown>[]) || [];
      const scraped = Number(ctx.variables.jobsScraped ?? 0);
      const parsed = Number(ctx.variables.jobsParsed ?? 0);
      const afterDedupe = Number(ctx.variables.jobsAfterDedupe ?? 0);
      const skippedDuplicate = Number(ctx.variables.jobsSkippedDuplicate ?? 0);
      const skippedNoLink = Number(ctx.variables.jobsSkippedNoLink ?? 0);
      const subject = String(
        data.subject || (processed.length === 0 ? `No New Jobs Found — ${today}` : 'CareerPilot Notification'),
      );
      let body = String(data.body || data.message || '');
      if (!body && processed.length === 0) {
        if (scraped === 0) {
          body = '<p>Apify returned no job listings for your LinkedIn search URL. Try broadening location or keywords in Settings.</p>';
        } else if (parsed === 0) {
          body = `<p>Apify returned ${scraped} listings but none could be parsed into jobs.</p>`;
        } else if (afterDedupe === 0 && skippedDuplicate > 0) {
          body = `<p>All ${skippedDuplicate} new job(s) were already in your jobs table.</p>`;
        } else if (afterDedupe === 0 && skippedNoLink > 0) {
          body = `<p>${skippedNoLink} parsed job(s) could not be processed because the job URL was missing.</p>`;
        } else if (afterDedupe === 0) {
          body = `<p>${parsed} job(s) were parsed but none were queued for tailoring.</p>`;
        } else {
          body = '<p>No new resumes were generated today.</p>';
        }
      }
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey && to && body) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: Deno.env.get('RESEND_FROM_EMAIL') || 'CareerPilot <onboarding@resend.dev>',
            to: [to],
            subject,
            html: body,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Email send failed');
        }
      }
      const admin = createAdminClient();
      await admin.from('notifications').insert({
        user_id: ctx.userId,
        type: 'email',
        title: subject,
        message: body.slice(0, 500),
        read: false,
      });
      return { output: { sent: true, to, subject }, status: 'success' };
    },
  },
  notification: {
    async execute(ctx, node, input) {
      const admin = createAdminClient();
      await admin.from('notifications').insert({
        user_id: ctx.userId,
        type: 'in_app',
        title: String(node.config.title || 'Workflow notification'),
        message: String((input as Record<string, unknown>)?.message || JSON.stringify(input).slice(0, 500)),
        read: false,
      });
      return { output: input, status: 'success' };
    },
  },
  openai: {
    async execute(ctx, node, input) {
      return nodeExecutors.gemini.execute(ctx, node, input);
    },
  },
  claude: {
    async execute(ctx, node, input) {
      return nodeExecutors.gemini.execute(ctx, node, input);
    },
  },
  http: {
    async execute(_ctx, node, input) {
      const url = String(node.config.url || '');
      const method = String(node.config.method || 'GET');
      const res = await fetch(url, { method, headers: node.config.headers as Record<string, string> });
      const output = await res.json().catch(() => res.text());
      return { output, status: res.ok ? 'success' : 'failed', error: res.ok ? undefined : String(output) };
    },
  },
  job_search: {
    async execute(ctx, node, input) {
      return nodeExecutors.apify.execute(ctx, { ...node, type: 'apify', config: { ...node.config, action: 'start_run' } }, input);
    },
  },
  loop: {
    async execute(_ctx, _node, input) {
      const items = Array.isArray(input) ? input : [input];
      return { output: items, status: 'success' };
    },
  },
  switch: {
    async execute(_ctx, node, input) {
      const field = node.config.field as string;
      const value = (input as Record<string, unknown>)?.[field];
      return { output: input, status: 'success', route: String(value) };
    },
  },
  prompt: {
    async execute(ctx, node, input) {
      const template = String(node.config.content || '');
      const prompt = resolveTemplate(template, ctx);
      const output = await callGemini('You are a helpful assistant.', prompt + '\n\nContext: ' + JSON.stringify(input).slice(0, 4000));
      return { output: { result: output }, status: 'success' };
    },
  },
  cover_letter: {
    async execute(ctx, node, input) {
      const job = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
      const company = String(job.company ?? job.companyName ?? 'Company');
      const title = String(job.title ?? job.role ?? 'Role');
      const output = await callGemini(
        'Write a professional cover letter.',
        `Write a cover letter for ${title} at ${company}. Job description: ${job.jobDescription ?? job.description ?? ''}`,
      );
      const admin = createAdminClient();
      await admin.from('cover_letters').insert({
        user_id: ctx.userId,
        name: `Cover Letter - ${company}`,
        company_name: company,
        role: title,
        content: output,
        job_id: job.jobId || null,
      });
      return { output: { content: output }, status: 'success' };
    },
  },
};

function buildLatex(raw: string): string {
  function esc(s: string): string {
    return String(s ?? '')
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/&/g, '\\&').replace(/%/g, '\\%').replace(/\$/g, '\\$')
      .replace(/#/g, '\\#').replace(/_/g, '\\_').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  }
  function section(text: string, header: string): string {
    const re = new RegExp(`(?:^|\\n)${header.replace(/ /g, '\\s+')}\\s*\\n([\\s\\S]*?)(?=\\n[A-Z][A-Z ]{2,}\\s*\\n|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  }
  const summaryRaw = section(raw, 'SUMMARY');
  const experienceRaw = section(raw, 'PROFESSIONAL EXPERIENCE');
  const nameRaw = section(raw, 'NAME');
  const fullName = (nameRaw.split('\n')[0] || 'Your Name').trim();
  const parts = fullName.split(' ');
  const firstName = esc(parts.length > 1 ? parts.slice(0, -1).join(' ') : fullName);
  const lastName = esc(parts.length > 1 ? parts[parts.length - 1] : '');
  return `\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{banking}
\\moderncvcolor{blue}
\\usepackage[scale=0.88]{geometry}
\\name{${firstName}}{${lastName}}
\\begin{document}
\\makecvtitle
\\section{Summary}
\\cvitem{}{${esc(summaryRaw.replace(/\n/g, ' '))}}
\\section{Professional Experience}
\\cvitem{}{${esc(experienceRaw.slice(0, 2000))}}
\\end{document}`;
}

export function getExecutor(type: string): NodeExecutor {
  const exec = nodeExecutors[type];
  if (!exec) {
    return {
      async execute(_ctx, node, input) {
        return { output: input, status: 'success' };
      },
    };
  }
  return exec;
}
