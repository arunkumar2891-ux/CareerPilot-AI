import type { NodeExecutor, NodeResult, RunContext, WorkflowNodeRow, WorkflowEdgeRow } from './types.ts';
import { getSecretOrIntegration, getIntegrationCredentials, getUserSettings } from '../credentials.ts';
import { resolveTemplate } from './graph.ts';
import { createAdminClient } from '../supabase-admin.ts';
import { buildEmailSummaryBlock } from './execution-persistence.ts';
import { prepareResumeGeneration } from '../career-corpus/generate.ts';
import { syncGoogleDocToCorpus } from '../google-doc-sync.ts';
import { normalizeLinkedInJobUrl, buildApifyJobSearchInput, expandJobSearchQuery, inferJobWorkplace, postedWithinCutoffIso, jobMatchesSearchQuery } from '../job-url.ts';
import {
  collectJobDedupeKeys,
  emptyJobRunDetail,
  filterDuplicateJobs,
  jobContentFingerprint,
  jobUrlKey,
  resolveJobInsertConflict,
} from '../job-dedupe.ts';
import { callGeminiAtsGenerateContent, callGeminiGenerateContent } from '../gemini.ts';
import { buildLatexFromAtsText } from '../resume-latex.ts';
import { compileLatexToPdf } from '../resume-pdf.ts';
import { upsertTailoredResume, linkResumePdf, resumeStorageObjectPath } from '../resume-store.ts';
import {
  formatUnknownError,
  loadExistingJobForPipeline,
  resolveLoadJobOutput,
  resolvePipelineJobId,
} from './job-discovery.ts';
import { uploadOrUpdateDrivePdf, resolveResumePdfFileName } from '../resume-drive.ts';
import { fetchWithTimeout, fetchJsonChecked } from '../fetch-timeout.ts';
import { parseGoogleDocFileId, parseGoogleDriveFolderId } from '../google-drive.ts';
import { currentSearchLabel, currentSearchLocation, currentSearchRole, isRemoteOnlySearch } from './role-loop.ts';
import { extractEmailFromText } from '../apply-email.ts';
import { loadMasterResumeText } from '../career-corpus/load.ts';
import { scoreJobsAgainstResume } from '../career-corpus/score.ts';
import { maxJobsPerRole } from '../job-search-roles.ts';

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

function recordInsertDuplicateSkip(ctx: RunContext): void {
  ctx.variables.jobsSkippedInsertDuplicate = Number(ctx.variables.jobsSkippedInsertDuplicate ?? 0) + 1;
}

async function findStoredJob(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  url: string,
  fingerprint: string,
): Promise<{ id: string } | null> {
  const firstId = (data: { id?: string }[] | null | undefined): string | null => {
    const id = data?.[0]?.id;
    return id ? String(id) : null;
  };

  if (url) {
    const { data } = await admin
      .from('jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('url', url)
      .order('created_at', { ascending: true })
      .limit(1);
    const id = firstId(data as { id?: string }[] | null);
    if (id) return { id };
  }
  if (fingerprint) {
    const { data } = await admin
      .from('jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('content_fingerprint', fingerprint)
      .order('created_at', { ascending: true })
      .limit(1);
    const id = firstId(data as { id?: string }[] | null);
    if (id) return { id };
  }
  return null;
}

async function callGemini(
  ctx: RunContext,
  systemPrompt: string,
  userPrompt: string,
  forAts = false,
  groundingSource?: string,
  options?: {
    groqUserPrompt?: string;
    educationSource?: string;
    identity?: { name?: string; contact?: string; education?: string };
  },
): Promise<string> {
  if (forAts) {
    const generated = await callGeminiAtsGenerateContent(
      systemPrompt,
      userPrompt,
      ctx.userId,
      groundingSource,
      options,
    );
    return generated.text;
  }
  return await callGeminiGenerateContent(systemPrompt, userPrompt, { userId: ctx.userId });
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
        const jobSearch = (ctx.settings.jobSearch as Record<string, unknown>) || {};
        const query = expandJobSearchQuery(
          String(node.config.query || currentSearchRole(ctx.variables, jobSearch) || 'Software Engineer'),
        );
        const location = String(node.config.location || currentSearchLocation(ctx.variables, jobSearch));
        const remoteOnly = isRemoteOnlySearch(ctx.variables);
        const apifyInput = buildApifyJobSearchInput(
          query,
          location,
          String(jobSearch.postedWithin || ''),
          undefined,
          { remoteOnly },
        );
        return {
          output: {
            linkedinUrl: apifyInput.linkedinUrl,
            query,
            location,
            datePosted: apifyInput.datePosted,
            postedWithin: jobSearch.postedWithin || '1d',
            searchRole: currentSearchLabel(ctx.variables) || query,
            remoteOnly,
          },
          status: 'success',
        };
      }
      if (action === 'limit') {
        const items = Array.isArray(input) ? input : (Array.isArray(ctx.items) ? ctx.items : [input]);
        const jobSearch = (ctx.settings.jobSearch as Record<string, unknown>) || {};
        const max = maxJobsPerRole(jobSearch);
        return { output: items.slice(0, max), status: 'success' };
      }
      if (action === 'match_score') {
        const items = (Array.isArray(input) ? input : (Array.isArray(ctx.items) ? ctx.items : [input]))
          .filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
        if (!items.length) return { output: [], status: 'success' };
        const master = await loadMasterResumeText(ctx.userId);
        const scored = await scoreJobsAgainstResume({
          jobs: items.map((job) => ({
            jobDescription: String(job.jobDescription || job.description || ''),
            jobTitle: String(job.title || job.role || ''),
            company: String(job.company || job.companyName || ''),
          })),
          resumeText: master.text,
          resumeName: master.name,
          userId: ctx.userId,
        });
        const output = items.map((job, index) => ({
          ...job,
          matchScore: scored[index]?.score ?? 0,
          matchScoreSource: scored[index]?.source || master.name,
        }));
        ctx.items = output;
        return { output, status: 'success' };
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
        const jobSearch = (ctx.settings.jobSearch as Record<string, unknown>) || {};
        const searchQuery = expandJobSearchQuery(currentSearchRole(ctx.variables, jobSearch));
        const searchLabel = currentSearchLabel(ctx.variables) || searchQuery;
        const remoteOnly = isRemoteOnlySearch(ctx.variables);
        const postedCutoff = postedWithinCutoffIso(String(jobSearch.postedWithin || ''));
        ctx.variables.jobsScraped = rawItems.length;
        let skippedQuery = 0;
        let skippedNotRemote = 0;
        for (const j of rawItems) {
          const jobLink = normalizeLinkedInJobUrl(String(j.link || j.jobUrl || j.url || ''));
          if (!jobLink) continue;
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
          const title = String(j.title || 'No Title');
          if (searchQuery && !jobMatchesSearchQuery(title, jobDescription, searchQuery)) {
            skippedQuery++;
            continue;
          }
          const workplaceType = [
            j.workplaceType,
            j.workType,
            Array.isArray(j.workplaceTypes) ? j.workplaceTypes.join(' ') : j.workplaceTypes,
            j.workRemoteAllowed === true || j.workRemoteAllowed === 'true' ? 'remote' : '',
            j.jobBenefits,
          ].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
          if (remoteOnly) {
            const workplace = inferJobWorkplace(
              String(j.location || ''),
              String(j.employmentType || ''),
              `${workplaceType} ${title} ${jobDescription.slice(0, 800)}`,
            );
            if (!workplace.remote) {
              skippedNotRemote++;
              continue;
            }
          }
          jobs.push({
            title,
            company: j.companyName || j.company || 'Unknown Company',
            location: j.location || 'Unknown Location',
            postedAt,
            employmentType: j.employmentType || '',
            seniorityLevel: j.seniorityLevel || '',
            workplaceType,
            jobLink,
            jobDescription,
            searchRole: searchLabel,
            applyEmail: extractEmailFromText(jobDescription),
          });
          if (jobs.length >= 40) break;
        }
        const { kept, skippedDuplicate } = filterDuplicateJobs(jobs);
        ctx.variables.jobsSkippedQueryMismatch = skippedQuery;
        ctx.variables.jobsSkippedNotRemote = skippedNotRemote;
        ctx.variables.jobsSkippedParseDuplicate = skippedDuplicate;
        ctx.variables.jobsParsed = kept.length;
        return { output: kept, status: 'success' };
      }
      if (fn === 'build_latex') {
        const data = input as Record<string, unknown>;
        if (data?.skipped) return { output: data, status: 'success' };
        const raw = String(data.output ?? '').trim();
        const jobSearch = (ctx.settings.jobSearch as Record<string, unknown> | undefined) || {};
        const template = (jobSearch.pdfTemplate as string) || 'classic';
        const latex = buildLatexFromAtsText(raw, {
          targetRole: String(data.title || data.role || ''),
          targetCompany: String(data.company || data.companyName || ''),
          template: template as import('../resume-latex.ts').PdfTemplate,
        });
        return { output: { ...data, latex }, status: 'success' };
      }
      if (fn === 'email_summary') {
        const summaryBlock = await buildEmailSummaryBlock(createAdminClient(), ctx.runId);
        const items = (ctx.variables.processedJobs as Record<string, unknown>[]) || [];
        const scraped = Number(ctx.variables.jobsScraped ?? 0);
        const parsed = Number(ctx.variables.jobsParsed ?? 0);
        const afterDedupe = Number(ctx.variables.jobsAfterDedupe ?? 0);
        const skippedDuplicate = Number(ctx.variables.jobsSkippedDuplicate ?? 0);
        const skippedNoLink = Number(ctx.variables.jobsSkippedNoLink ?? 0);
        if (items.length === 0) {
          const email = (ctx.settings.notifications as Record<string, string>)?.email || ctx.settings.userEmail;
          const today = new Date().toISOString().slice(0, 10);
          const detail = emptyJobRunDetail({
            scraped,
            parsed,
            afterDedupe,
            skippedDuplicate,
            skippedNoLink,
            skippedInsertDuplicate: Number(ctx.variables.jobsSkippedInsertDuplicate ?? 0),
            skippedParseDuplicate: Number(ctx.variables.jobsSkippedParseDuplicate ?? 0),
            skippedQueryMismatch: Number(ctx.variables.jobsSkippedQueryMismatch ?? 0),
          });
          return {
            output: {
              subject: `No New Jobs Found — ${today}`,
              body: `${summaryBlock}<p>${detail}</p>`,
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
        return {
          output: {
            subject: `ATS Resumes Ready (${items.length}) — ${today}`,
            body: `${summaryBlock}${body}`,
            to: email,
          },
          status: 'success',
        };
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
        const prev = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
        let linkedinUrl = prev.linkedinUrl as string | undefined;
        let query = prev.query as string | undefined;
        let location = prev.location as string | undefined;
        if (!linkedinUrl || !query) {
          for (const out of Object.values(ctx.nodeOutputs)) {
            const o = out as Record<string, unknown>;
            if (o?.linkedinUrl && !linkedinUrl) linkedinUrl = String(o.linkedinUrl);
            if (o?.query && !query) query = String(o.query);
            if (o?.location && !location) location = String(o.location);
          }
        }
        const jobSearch = (ctx.settings.jobSearch as Record<string, unknown>) || {};
        const scrapeLimit = maxJobsPerRole(jobSearch);
        const remoteOnly = isRemoteOnlySearch(ctx.variables) || prev.remoteOnly === true || prev.remoteOnly === 'true';
        const apifyInput = buildApifyJobSearchInput(
          query || currentSearchRole(ctx.variables, jobSearch),
          location || currentSearchLocation(ctx.variables, jobSearch),
          String(jobSearch.postedWithin || ''),
          scrapeLimit,
          { remoteOnly },
        );
        ctx.variables.jobSearchQuery = apifyInput.keywords;
        ctx.variables.linkedinSearchUrl = apifyInput.linkedinUrl;

        const json = await fetchJsonChecked<{ data?: { id: string; defaultDatasetId: string } }>(
          `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keywords: apifyInput.keywords,
              location: apifyInput.location,
              datePosted: apifyInput.datePosted,
              scrapeCompany: true,
              autoConvertToAiSearch: true,
              limitPerSource: apifyInput.limitPerSource ?? scrapeLimit,
              ...(apifyInput.workType ? { f_WT: apifyInput.workType, workType: apifyInput.workType } : {}),
            }),
          },
          30000,
          'Apify start run',
        );
        if (!json.data?.id) throw new Error('Apify start failed: response missing run id');
        ctx.variables.apifyRunId = json.data.id;
        ctx.variables.apifyDatasetId = json.data.defaultDatasetId;
        return { output: json.data, status: 'success' };
      }
      if (action === 'check_status') {
        const runId = ctx.variables.apifyRunId as string;
        const url = `https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${token}`;
        let json: { data?: { status?: string } };
        try {
          json = await fetchJsonChecked(url, {}, 30000, 'Apify status check');
          ctx.variables.apifyPollErrors = 0;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // 4xx means a permanent problem (bad token, run gone) — fail fast.
          if (/HTTP 4\d\d/.test(message)) throw err instanceof Error ? err : new Error(message);
          // Transient errors (5xx, HTML error pages, network) — keep polling instead of killing the run.
          const failures = Number(ctx.variables.apifyPollErrors ?? 0) + 1;
          ctx.variables.apifyPollErrors = failures;
          if (failures >= 5) {
            throw new Error(`Apify status check failed ${failures} times in a row: ${message}`);
          }
          return {
            output: { pollError: message, consecutiveFailures: failures },
            status: 'waiting',
            resumeAt: new Date(Date.now() + 10000),
          };
        }
        const status = json.data?.status;
        if (status === 'SUCCEEDED') return { output: json.data, status: 'success', route: 'true' };
        if (status === 'FAILED' || status === 'ABORTED') throw new Error(`Apify run ${status}`);
        return { output: json.data, status: 'waiting', resumeAt: new Date(Date.now() + 10000) };
      }
      if (action === 'fetch_dataset') {
        const datasetId = ctx.variables.apifyDatasetId as string;
        const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`;
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const items = await fetchJsonChecked<unknown[]>(url, {}, 30000, 'Apify dataset fetch');
            return { output: items, status: 'success' };
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (/HTTP 4\d\d/.test(lastError.message)) break;
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
        throw lastError ?? new Error('Apify dataset fetch failed');
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
      const admin = createAdminClient();
      const { data: existingRows } = await admin
        .from('jobs')
        .select('url, company, role, location, description')
        .eq('user_id', ctx.userId);
      const existingKeys = new Set<string>();
      for (const row of existingRows || []) {
        for (const key of collectJobDedupeKeys(row as Record<string, unknown>)) {
          existingKeys.add(key);
        }
      }
      const { kept, skippedDuplicate, skippedNoIdentity } = filterDuplicateJobs(input, existingKeys);
      ctx.variables.jobsAfterDedupe = kept.length;
      ctx.variables.jobsSkippedDuplicate = skippedDuplicate;
      ctx.variables.jobsSkippedNoLink = skippedNoIdentity;
      return { output: kept, status: 'success' };
    },
  },
  gdocs: {
    async execute(ctx, node) {
      const fileId = parseGoogleDocFileId(resolveTemplate(String(node.config.fileId || ''), ctx));
      if (!fileId || fileId.includes('{{') || fileId.includes('YOUR_GOOGLE')) {
        return {
          output: { skipped: true, reason: 'no_google_doc' },
          status: 'success',
        };
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
      if (action === 'upload') {
        const incoming = input && typeof input === 'object' ? input as Record<string, unknown> : {};
        if (incoming.skipped) return { output: incoming, status: 'success' };
        const jobSearch = (ctx.settings.jobSearch as Record<string, unknown>) || {};
        if (jobSearch.autoUploadDrive !== true) {
          return { output: { ...incoming, skipped: true, reason: 'drive_manual_only' }, status: 'success' };
        }

        const data = incoming;
        const rawPdf = data.pdfBytes;
        const pdfBytes = rawPdf instanceof Uint8Array
          ? rawPdf
          : Array.isArray(rawPdf)
            ? new Uint8Array(rawPdf as number[])
            : null;
        if (!pdfBytes?.length) {
          return { output: { ...data, skipped: true, reason: 'missing_pdf_bytes' }, status: 'success' };
        }

        const folderRaw = resolveTemplate(String(node.config.folderId || ''), ctx)
          || String(jobSearch.driveFolderId || '');
        const folderId = parseGoogleDriveFolderId(folderRaw);
        if (!folderId) {
          return { output: { ...data, skipped: true, reason: 'no_drive_folder' }, status: 'success' };
        }

        const company = String(data.company || data.companyName || 'Company').trim();
        const role = String(data.title || data.role || data.docTitle || 'Role').trim();
        const fileName = await resolveResumePdfFileName(ctx.userId, { company, role });
        const admin = createAdminClient();
        const resumeId = String(data.resumeId || '');
        let existingFileId: string | null = null;
        if (resumeId) {
          const { data: resumeRow } = await admin
            .from('resumes')
            .select('drive_file_id')
            .eq('id', resumeId)
            .maybeSingle();
          existingFileId = (resumeRow?.drive_file_id as string | null) || null;
        }

        const drive = await uploadOrUpdateDrivePdf(ctx.userId, {
          pdfBytes,
          fileName,
          folderId,
          existingFileId,
        });
        if (resumeId) {
          await admin.from('resumes').update({
            drive_file_id: drive.fileId,
            drive_synced_at: new Date().toISOString(),
          }).eq('id', resumeId);
        }

        const processed = (ctx.variables.processedJobs as Record<string, unknown>[]) || [];
        processed.push({ ...data, pdfLink: drive.pdfLink, pdf_url: drive.pdfLink, driveFolderId: folderId });
        ctx.variables.processedJobs = processed;
        return { output: { ...data, id: drive.fileId, pdfLink: drive.pdfLink }, status: 'success' };
      }
      return { output: input, status: 'success' };
    },
  },
  gemini: {
    async execute(ctx, node, input) {
      const job = (input && typeof input === 'object' ? input : ctx.variables.currentItem) as Record<string, unknown> | undefined;
      if (!job) {
        return { output: { skipped: true, reason: 'no_job_input' }, status: 'success' };
      }
      if (job.skipped) {
        return { output: job, status: 'success' };
      }
      const jd = String(job.jobDescription || job.description || '');
      const prepared = await prepareResumeGeneration(ctx.userId, {
        jobDescription: jd,
        jobTitle: String(job.title || job.role || ''),
        company: String(job.company || job.companyName || ''),
        googleHeader: String(ctx.variables.googleHeader || ''),
      });
      const output = await callGemini(
        ctx,
        prepared.systemPrompt,
        prepared.userPrompt,
        true,
        prepared.groundingSource,
        {
          groqUserPrompt: prepared.groqUserPrompt,
          educationSource: prepared.corpus.educationSource,
          identity: prepared.identity,
        },
      );
      ctx.variables.lastAgentOutput = output;
      ctx.variables.resumeSource = prepared.corpus.sourceName;
      ctx.variables.masterResumeSource = prepared.corpus.sourceKind;

      const tailoredContent = String(output || '').trim();
      if (tailoredContent.length > 0) {
        const admin = createAdminClient();
        const company = String(job.company || job.companyName || 'Company');
        const role = String(job.title || job.role || 'Role');
        const jobId = String(job.jobId || job.id || ctx.variables.lastJobId || '');
        const resumeId = await upsertTailoredResume(admin, ctx.userId, {
          jobId: jobId || undefined,
          company,
          role,
          content: tailoredContent,
        });
        return { output: { ...job, output: tailoredContent, resumeId, jobId: jobId || job.jobId }, status: 'success' };
      }

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
      if (action === 'load_job') {
        if (input && typeof input === 'object' && (input as Record<string, unknown>).skipped) {
          return { output: input, status: 'success' };
        }
        const jobId = resolvePipelineJobId(input, ctx.variables.targetJobId);
        let loaded: Record<string, unknown> | null = null;
        try {
          loaded = await loadExistingJobForPipeline(
            {
              findOwned: async (id, uid) => {
                const { data, error } = await admin
                  .from('jobs')
                  .select('*')
                  .eq('id', id)
                  .eq('user_id', uid)
                  .maybeSingle();
                if (error) throw new Error(formatUnknownError(error));
                return (data as Record<string, unknown> | null) ?? null;
              },
              markGenerating: async (id, uid) => {
                const { error } = await admin
                  .from('jobs')
                  .update({ resume_status: 'generating' })
                  .eq('id', id)
                  .eq('user_id', uid);
                if (error) throw new Error(formatUnknownError(error));
              },
            },
            ctx.userId,
            jobId,
          );
        } catch (err) {
          loaded = null;
          const fallback = resolveLoadJobOutput(null, input, ctx.variables.targetJobId);
          if (!fallback.jobId) throw new Error(formatUnknownError(err));
          ctx.variables.lastJobId = fallback.jobId;
          return { output: fallback, status: 'success' };
        }
        const item = resolveLoadJobOutput(loaded, input, ctx.variables.targetJobId);
        ctx.variables.lastJobId = item.jobId;
        return { output: item, status: 'success' };
      }
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
        const url = jobUrlKey(job);
        const fingerprint = jobContentFingerprint({
          ...job,
          url,
          company: job.company ?? job.companyName,
          role: job.title ?? job.role,
          description: job.jobDescription ?? job.description,
        });
        const existing = await findStoredJob(admin, ctx.userId, url, fingerprint);
        if (existing) {
          recordInsertDuplicateSkip(ctx);
          ctx.variables.lastJobId = existing.id;
          return {
            output: { ...job, jobId: existing.id, skipped: true, reason: 'duplicate' },
            status: 'success',
          };
        }
        const row = {
          user_id: ctx.userId,
          company: String(job.company ?? job.companyName ?? ''),
          role: String(job.title ?? job.role ?? ''),
          description: String(job.jobDescription ?? job.description ?? ''),
          match_score: Number(job.matchScore ?? job.match_score ?? 0),
          match_score_source: String(job.matchScoreSource || job.match_score_source || '') || null,
          skills: [],
          posting_date: job.postedAt || new Date().toISOString(),
          source: 'linkedin/apify',
          location: String(job.location || ''),
          remote: workplace.remote,
          hybrid: workplace.hybrid,
          experience: String(job.seniorityLevel || ''),
          duplicate: false,
          resume_status: 'generating',
          application_status: 'draft',
          status: 'queued',
          url,
          content_fingerprint: fingerprint || null,
          apply_email: job.applyEmail ? String(job.applyEmail) : null,
          apply_email_source: job.applyEmail ? 'extracted' : null,
        };
        const { data, error } = await admin.from('jobs').insert(row).select().single();
        if (error) {
          const raced = await findStoredJob(admin, ctx.userId, url, fingerprint);
          const conflict = resolveJobInsertConflict(error, raced?.id);
          if (conflict) {
            recordInsertDuplicateSkip(ctx);
            if (raced?.id) ctx.variables.lastJobId = raced.id;
            return {
              output: { ...job, ...conflict },
              status: 'success',
            };
          }
          throw error;
        }
        ctx.variables.lastJobId = data.id;
        const resumeId = String(job.resumeId || '');
        if (resumeId) {
          await admin.from('resumes').update({ job_id: data.id }).eq('id', resumeId).is('job_id', null);
        }
        return { output: { ...job, jobId: data.id }, status: 'success' };
      }
      return { output: input, status: 'success' };
    },
  },
  pdf: {
    async execute(_ctx, node, input) {
      const data = input as Record<string, unknown>;
      if (data?.skipped) return { output: data, status: 'success' };
      const latex = String(data.latex || '');
      const pdfBytes = await compileLatexToPdf(latex);
      return { output: { ...data, pdfBytes, docTitle: data.title || data.role }, status: 'success' };
    },
  },
  storage: {
    async execute(ctx, node, input) {
      const data = input as Record<string, unknown>;
      if (data?.skipped) return { output: data, status: 'success' };
      const pdfBytes = data.pdfBytes as Uint8Array;
      if (!pdfBytes) return { output: data, status: 'success' };
      const admin = createAdminClient();
      const resumeId = String(data.resumeId || '');
      const fileName = await resolveResumePdfFileName(ctx.userId, {
        company: String(data.company || data.companyName || ''),
        role: String(data.title || data.role || data.docTitle || ''),
      });
      const path = resumeStorageObjectPath(ctx.userId, fileName);
      const { error } = await admin.storage.from('resumes').upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (error) throw error;
      const { data: signed } = await admin.storage.from('resumes').createSignedUrl(path, 60 * 60 * 24 * 7);
      const pdfUrl = signed?.signedUrl || '';
      await admin.from('documents').insert({
        user_id: ctx.userId,
        name: fileName,
        type: 'pdf',
        size: pdfBytes.length,
        folder: 'resumes',
        tags: ['generated'],
        storage_path: path,
      });
      if (resumeId) {
        await linkResumePdf(admin, resumeId, { storagePath: path, pdfUrl });
      }
      if (data.jobId) {
        await admin.from('jobs').update({
          pdf_url: pdfUrl,
          resume_status: 'ready',
          status: 'resume_ready',
        }).eq('id', data.jobId);
      }

      const processed = (ctx.variables.processedJobs as Record<string, unknown>[]) || [];
      processed.push({
        ...data,
        company: data.company || data.companyName,
        roleName: data.title || data.role,
        title: data.title || data.role,
        jobLink: data.jobLink || data.url,
        pdfLink: pdfUrl,
        pdf_url: pdfUrl,
        resumeId,
        fileName,
        storage_path: path,
      });
      ctx.variables.processedJobs = processed;

      return { output: { ...data, pdf_url: pdfUrl, storage_path: path, fileName }, status: 'success' };
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
        body = `<p>${emptyJobRunDetail({
          scraped,
          parsed,
          afterDedupe,
          skippedDuplicate,
          skippedNoLink,
          skippedInsertDuplicate: Number(ctx.variables.jobsSkippedInsertDuplicate ?? 0),
          skippedParseDuplicate: Number(ctx.variables.jobsSkippedParseDuplicate ?? 0),
          skippedQueryMismatch: Number(ctx.variables.jobsSkippedQueryMismatch ?? 0),
        })}</p>`;
      }
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey && to && body) {
        const res = await fetchWithTimeout(
          'https://api.resend.com/emails',
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: Deno.env.get('RESEND_FROM_EMAIL') || 'CareerPilot <onboarding@resend.dev>',
              to: [to],
              subject,
              html: body,
            }),
          },
          30000,
          'Resend email',
        );
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
      const output = await callGemini(ctx, 'You are a helpful assistant.', prompt + '\n\nContext: ' + JSON.stringify(input).slice(0, 4000));
      return { output: { result: output }, status: 'success' };
    },
  },
  cover_letter: {
    async execute(ctx, node, input) {
      const job = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
      const company = String(job.company ?? job.companyName ?? 'Company');
      const title = String(job.title ?? job.role ?? 'Role');
      const output = await callGemini(
        ctx,
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
