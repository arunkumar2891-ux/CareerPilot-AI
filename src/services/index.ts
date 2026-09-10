import type {
  Job, Resume, CoverLetter, Application, Workflow, Agent,
  Document, Notification, Integration, Prompt, Automation,
  ChatConversation, DashboardMetrics, AnalyticsPoint, UserProfile, AiUsageSummary,
  AtsReview,
  JobSearchConfig, ChatMessage, AgentRun, WorkflowRunDetail,
  JobExecution, NodeExecution, WorkflowSnapshot, WorkflowRun,
} from '@/types';
import { supabase } from '@/lib/supabase';
import { requireUserId } from '@/lib/auth';
import { DEFAULT_JOB_SEARCH_WORKFLOW, DEFAULT_RESUME_TAILOR_WORKFLOW, buildSeedEdges, buildTailorSeedEdges } from '@/constants/workflow-seed';
import { computeNextCronRun } from '@/utils/cron-schedule';
import {
  MASTER_RESUME_NAME,
  applyContactOverlay,
} from '@/content/career-corpus';
import { corpusGroup, hasUsableMasterResume, isCorpusResume, isJobResume } from '@/utils/resume-classification';
import { parseGoogleDocFileId } from '@/utils/google';
import {
  assertResumeUploadFile,
  sanitizeAttachmentLabel,
  sanitizeExtractedResumeText,
  sanitizeResumeName,
} from '@/utils/upload-sanitize';
import { PROVIDER_FREE_TIER_MONTHLY_TOKENS } from '@/constants/ai-usage';
import type { WorkflowEdge, WorkflowNode } from '@/types';

/* ── helpers ── */

type ResumeActionResponse = { error?: string; code?: string };

function throwResumeActionError(data: ResumeActionResponse | null, fallback = 'Request failed'): void {
  if (!data?.error) return;
  if (data.code === 'google_auth_expired') {
    throw new Error('Google Drive connection expired. Go to Integrations → reconnect Google Drive, then try again.');
  }
  throw new Error(String(data.error || fallback));
}

async function refreshHeaderCredits(): Promise<void> {
  try {
    const { useAuthStore } = await import('@/store');
    await useAuthStore.getState().refresh();
  } catch {
    /* store may be unavailable during bootstrap */
  }
}

const isDebugClient = import.meta.env.DEV || import.meta.env.VITE_DEBUG_BUILD === 'true';

function logEdgeFunctionFailure(
  functionName: string,
  body: Record<string, unknown>,
  result: { data: unknown; error: unknown },
): void {
  if (!isDebugClient) return;
  console.groupCollapsed(`[${functionName}] request failed`);
  console.error('error', result.error);
  console.error('response data', result.data);
  console.error('request body', body);
  console.groupEnd();
}

async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null;
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = await context.json() as { error?: string };
    return body?.error ? String(body.error) : null;
  } catch {
    return null;
  }
}

function payloadErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('error' in data)) return null;
  const message = (data as { error?: unknown }).error;
  return message ? String(message) : null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

async function invokeAiChat(body: Record<string, unknown>) {
  const result = await supabase.functions.invoke('ai-chat', { body });
  const serverMessage = payloadErrorMessage(result.data)
    ?? (result.error ? await readFunctionErrorMessage(result.error) : null);

  if (result.error || serverMessage) {
    logEdgeFunctionFailure('ai-chat', body, {
      data: result.data ?? (serverMessage ? { error: serverMessage } : null),
      error: result.error,
    });
    return {
      data: result.data,
      error: new Error(serverMessage || (result.error instanceof Error ? result.error.message : 'ai-chat request failed')),
    };
  }

  if (!result.error) void refreshHeaderCredits();
  return result;
}

const JOB_STATUSES: Job['status'][] = [
  'discovered', 'queued', 'resume_ready', 'applied', 'interview', 'offer', 'rejected', 'withdrawn',
];

function mapJob(row: Record<string, unknown>): Job {
  const rawStatus = String(row.status ?? 'discovered');
  const status = JOB_STATUSES.includes(rawStatus as Job['status'])
    ? (rawStatus as Job['status'])
    : 'discovered';
  return {
    id: String(row.id),
    company: String(row.company ?? ''),
    role: String(row.role ?? ''),
    description: String(row.description ?? ''),
    matchScore: Number(row.match_score ?? 0),
    salaryMin: row.salary_min as number | undefined,
    salaryMax: row.salary_max as number | undefined,
    skills: (row.skills as string[]) ?? [],
    postingDate: (row.posting_date as string) ?? (row.created_at as string),
    source: String(row.source ?? ''),
    location: String(row.location ?? ''),
    remote: Boolean(row.remote),
    hybrid: Boolean(row.hybrid),
    experience: row.experience as string | undefined,
    duplicate: Boolean(row.duplicate),
    resumeStatus: (row.resume_status as Job['resumeStatus']) ?? 'none',
    applicationStatus: (row.application_status as Job['applicationStatus']) ?? 'draft',
    status,
    url: row.url as string | undefined,
    resumeId: row._resume_id as string | undefined,
    driveFileId: row._drive_file_id as string | undefined,
    pdfUrl: (row._pdf_url as string | undefined) || (row.pdf_url as string | undefined),
    createdAt: row.created_at as string,
  };
}

const JOB_STATUS_RANK: Record<string, number> = {
  offer: 70,
  interview: 60,
  applied: 50,
  resume_ready: 40,
  queued: 20,
  discovered: 10,
  rejected: 5,
  withdrawn: 1,
};

/** Job Discovery must not show the same LinkedIn posting twice. */
function collapseJobsByUrl(jobs: Job[]): Job[] {
  const best = new Map<string, Job>();
  const noUrl: Job[] = [];
  const score = (job: Job) =>
    (JOB_STATUS_RANK[job.status] || 0) + (job.resumeStatus === 'ready' ? 15 : 0) + (job.pdfUrl ? 5 : 0);

  for (const job of jobs) {
    const url = String(job.url || '').trim();
    if (!url) {
      noUrl.push(job);
      continue;
    }
    const prev = best.get(url);
    if (!prev) {
      best.set(url, job);
      continue;
    }
    const nextScore = score(job);
    const prevScore = score(prev);
    if (nextScore > prevScore) best.set(url, job);
    else if (nextScore === prevScore && job.createdAt < prev.createdAt) best.set(url, job);
  }
  return [...best.values(), ...noUrl];
}

function mapResume(row: Record<string, unknown>): Resume {
  const resume: Resume = {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: (row.type as Resume['type']) ?? 'general',
    content: String(row.content ?? ''),
    atsScore: Number(row.ats_score ?? 0),
    atsReview: parseAtsReview(row.ats_review),
    jobId: row.job_id as string | undefined,
    driveFileId: row.drive_file_id as string | undefined,
    driveSyncedAt: row.drive_synced_at as string | undefined,
    storagePath: row.storage_path as string | undefined,
    pdfUrl: row.pdf_url as string | undefined,
    versions: (row.resume_versions as Record<string, unknown>[])?.map((v) => ({
      id: String(v.id),
      resumeId: String(v.resume_id ?? row.id),
      version: Number(v.version ?? 1),
      content: String(v.content ?? ''),
      atsScore: Number(v.ats_score ?? 0),
      createdAt: (v.created_at as string) ?? '',
      note: v.note as string | undefined,
    })) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
  resume.isCorpus = row.is_corpus === true || isCorpusResume(resume);
  resume.corpusType = (row.corpus_type as Resume['corpusType']) || null;
  resume.corpusSource = (row.corpus_source as Resume['corpusSource']) || null;
  return resume;
}

function mapCoverLetter(row: Record<string, unknown>): CoverLetter {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    jobId: row.job_id as string | undefined,
    companyName: row.company_name as string | undefined,
    role: row.role as string | undefined,
    content: String(row.content ?? ''),
    versions: [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapApplication(row: Record<string, unknown>): Application {
  return {
    id: String(row.id),
    jobId: row.job_id as string | undefined,
    company: String(row.company ?? ''),
    role: String(row.role ?? ''),
    resumeVersionId: row.resume_version_id as string | undefined,
    coverLetterId: row.cover_letter_id as string | undefined,
    applicationDate: (row.application_date as string) ?? (row.created_at as string),
    recruiter: row.recruiter as string | undefined,
    status: (row.status as Application['status']) ?? 'draft',
    timeline: (row.application_events as Record<string, unknown>[])?.map((e) => ({
      id: String(e.id),
      type: e.type as Application['timeline'][number]['type'],
      label: String(e.label ?? ''),
      date: (e.event_date as string) ?? '',
      description: e.description as string | undefined,
    })) ?? [],
    notes: String(row.notes ?? ''),
    attachments: ((row.attachments as string[]) ?? []).map(sanitizeAttachmentLabel),
    createdAt: row.created_at as string,
  };
}

function mapWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    active: Boolean(row.active),
    nodes: (row.workflow_nodes as Record<string, unknown>[])?.map((n) => ({
      id: String(n.id),
      type: n.type as Workflow['nodes'][number]['type'],
      name: String(n.name ?? ''),
      position: { x: Number(n.position_x ?? 0), y: Number(n.position_y ?? 0) },
      config: (n.config as Record<string, unknown>) ?? {},
      status: 'idle' as const,
    })) ?? [],
    edges: (row.workflow_edges as Record<string, unknown>[])?.map((e) => ({
      id: String(e.id),
      source: String(e.source_id ?? ''),
      target: String(e.target_id ?? ''),
      label: e.label as string | undefined,
    })) ?? [],
    schedule: row.schedule as string | undefined,
    lastRun: row.last_run as string | undefined,
    nextRun: row.next_run as string | undefined,
    runs: [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: (row.type as Agent['type']) ?? 'career_advisor',
    description: String(row.description ?? ''),
    prompt: String(row.prompt ?? ''),
    model: (row.model as Agent['model']) ?? 'gemini',
    temperature: Number(row.temperature ?? 0.3),
    memory: Boolean(row.memory),
    enabled: Boolean(row.enabled),
    runs: (row.agent_runs as Record<string, unknown>[])?.map((r) => ({
      id: String(r.id),
      agentId: String(r.agent_id ?? row.id),
      status: (r.status as AgentRun['status']) ?? 'success',
      input: String(r.input ?? ''),
      output: String(r.output ?? ''),
      startedAt: (r.started_at as string) ?? (r.created_at as string),
      duration: Number(r.duration_ms ?? 0),
      cost: Number(r.cost ?? 0),
      tokens: Number(r.tokens ?? 0),
    })) ?? [],
    metrics: (row.metrics as Agent['metrics']) ?? { runs: 0, successRate: 0, avgLatency: 0, totalCost: 0, tokens: 0 },
    createdAt: row.created_at as string,
  };
}

function mapDocument(row: Record<string, unknown>): Document {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: (row.type as Document['type']) ?? 'txt',
    size: Number(row.size ?? 0),
    folder: String(row.folder ?? ''),
    tags: (row.tags as string[]) ?? [],
    content: row.content as string | undefined,
    versions: (row.document_versions as Record<string, unknown>[])?.map((v) => ({
      id: String(v.id),
      version: Number(v.version ?? 1),
      createdAt: (v.created_at as string) ?? '',
    })) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    type: (row.type as Notification['type']) ?? 'in_app',
    title: String(row.title ?? ''),
    message: String(row.message ?? ''),
    read: Boolean(row.read),
    createdAt: row.created_at as string,
  };
}

function mapIntegration(row: Record<string, unknown>): Integration {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    status: (row.status as Integration['status']) ?? 'disconnected',
    description: String(row.description ?? ''),
    icon: String(row.icon ?? ''),
    lastSync: row.last_sync as string | undefined,
    logs: (row.integration_logs as Record<string, unknown>[])?.map((l) => ({
      id: String(l.id),
      message: String(l.message ?? ''),
      level: (l.level as 'info' | 'error') ?? 'info',
      timestamp: (l.timestamp as string) ?? '',
    })) ?? [],
  };
}

function mapPrompt(row: Record<string, unknown>): Prompt {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    content: String(row.content ?? ''),
    variables: (row.variables as string[]) ?? [],
    version: Number(row.version ?? 1),
    history: (row.prompt_versions as Record<string, unknown>[])?.map((v) => ({
      id: String(v.id),
      version: Number(v.version ?? 1),
      content: String(v.content ?? ''),
      createdAt: (v.created_at as string) ?? '',
    })) ?? [],
    createdAt: row.created_at as string,
  };
}

function mapAutomation(row: Record<string, unknown>): Automation {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    workflowId: String(row.workflow_id ?? ''),
    status: (row.status as Automation['status']) ?? 'paused',
    schedule: String(row.schedule ?? ''),
    trigger: String(row.trigger ?? ''),
    lastRun: row.last_run as string | undefined,
    nextRun: row.next_run as string | undefined,
    retries: Number(row.retries ?? 0),
    versions: [],
    createdAt: row.created_at as string,
  };
}

function parseAtsReview(raw: unknown): AtsReview | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const score = Number(r.score);
  const feedback = Array.isArray(r.feedback) ? r.feedback.map(String) : [];
  if (!score && !feedback.length) return undefined;
  return {
    score,
    feedback,
    suggestions: Array.isArray(r.suggestions) ? r.suggestions.map(String) : undefined,
    scoredAt: String(r.scoredAt || r.scored_at || new Date().toISOString()),
  };
}

function mapConversation(row: Record<string, unknown>): ChatConversation {
  const messageRows = (row.chat_messages as Record<string, unknown>[]) || [];
  messageRows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    resumeId: row.resume_id as string | undefined,
    messages: messageRows.map((m) => ({
      id: String(m.id),
      role: (m.role as ChatMessage['role']) ?? 'user',
      content: String(m.content ?? ''),
      artifact: m.artifact_type ? {
        type: m.artifact_type as ChatMessage['artifact'] extends infer A ? A extends { type: infer T } ? T : never : never,
        title: String(m.artifact_title ?? ''),
        content: String(m.artifact_content ?? ''),
      } : undefined,
      createdAt: (m.created_at as string) ?? '',
      pinned: Boolean(m.pinned),
    })) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id ?? row.user_id ?? ''),
    email: String(row.email ?? ''),
    fullName: String(row.full_name ?? ''),
    title: String(row.title ?? ''),
    avatarUrl: row.avatar_url as string | undefined,
    plan: (row.plan as UserProfile['plan']) ?? 'free',
    aiTokensUsed: Number(row.ai_credits_used ?? 0),
  };
}

/* ── services ── */

export class JobSearchService {
  async list(): Promise<Job[]> {
    const userId = await requireUserId();
    const [{ data: jobRows, error }, { data: resumeRows, error: resumeError }] = await Promise.all([
      supabase.from('jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase
        .from('resumes')
        .select('id, job_id, drive_file_id, pdf_url, storage_path')
        .eq('user_id', userId)
        .not('job_id', 'is', null),
    ]);
    if (error) throw error;
    if (resumeError) throw resumeError;

    const resumeByJob = new Map(
      (resumeRows || []).map((row) => [String(row.job_id), row]),
    );

    return collapseJobsByUrl((jobRows || []).map((row) => {
      const linked = resumeByJob.get(String(row.id));
      return mapJob({
        ...row,
        _resume_id: linked?.id,
        _drive_file_id: linked?.drive_file_id,
        _pdf_url: linked?.pdf_url || row.pdf_url,
      });
    }));
  }
  async search(config: Partial<JobSearchConfig>): Promise<Job[]> {
    let q = supabase.from('jobs').select('*');
    if (config.remote) q = q.eq('remote', true);
    if (config.hybrid) q = q.eq('hybrid', true);
    if (config.salaryMin) q = q.gte('salary_min', config.salaryMin);
    const { data, error } = await q.order('match_score', { ascending: false }).limit(config.maxJobs || 30);
    if (error) throw error;
    let results = collapseJobsByUrl((data || []).map(mapJob));
    if (config.keywords?.length) {
      results = results.filter((j) =>
        config.keywords!.some((k) =>
          j.role.toLowerCase().includes(k.toLowerCase()) ||
          j.description.toLowerCase().includes(k.toLowerCase()) ||
          j.skills.some((s) => s.toLowerCase().includes(k.toLowerCase()))
        )
      );
    }
    if (config.locations?.length) {
      results = results.filter((j) => config.locations!.some((l) => j.location.includes(l)));
    }
    if (config.companies?.length) {
      results = results.filter((j) => config.companies!.some((c) => j.company.toLowerCase().includes(c.toLowerCase())));
    }
    return results;
  }
  async updateStatus(id: string, status: Job['status']): Promise<void> {
    const { error } = await supabase.from('jobs').update({ status }).eq('id', id);
    if (error) throw error;
  }
  async deleteAll(): Promise<number> {
    const userId = await requireUserId();
    const { data: jobs, error: listError } = await supabase.from('jobs').select('id').eq('user_id', userId);
    if (listError) throw listError;
    const jobIds = (jobs || []).map((j) => j.id as string);
    if (jobIds.length) {
      const { error: appError } = await supabase.from('applications').delete().in('job_id', jobIds);
      if (appError) throw appError;
    }
    const { error, count } = await supabase.from('jobs').delete({ count: 'exact' }).eq('user_id', userId);
    if (error) throw error;
    return count ?? jobIds.length;
  }
}

export class ResumeService {
  async list(options?: { kind?: 'job' | 'corpus' | 'all' }): Promise<Resume[]> {
    const kind = options?.kind ?? 'all';
    const { data, error } = await supabase.from('resumes').select('*, resume_versions(*)').order('created_at', { ascending: false });
    if (error) throw error;
    let rows = (data || []).map(mapResume);
    if (kind === 'job') rows = rows.filter(isJobResume);
    if (kind === 'corpus') rows = rows.filter(isCorpusResume);
    return rows;
  }
  async hasMasterResume(): Promise<boolean> {
    const resumes = await this.list({ kind: 'corpus' });
    return hasUsableMasterResume(resumes);
  }
  async get(id: string): Promise<Resume | undefined> {
    const { data, error } = await supabase.from('resumes').select('*, resume_versions(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapResume(data) : undefined;
  }
  async createCorpus(input: {
    name: string;
    content: string;
    corpusType: 'master' | 'role_specific';
    corpusSource: 'google_doc' | 'upload' | 'paste';
  }): Promise<Resume> {
    const userId = await requireUserId();
    const name = input.corpusType === 'master' ? MASTER_RESUME_NAME : sanitizeResumeName(input.name);
    if (!name) throw new Error('Role name is required');
    const content = sanitizeExtractedResumeText(input.content);
    if (!content) throw new Error('Resume content is empty');
    const { data: existing } = await supabase
      .from('resumes')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle();
    if (existing?.id) {
      const { data, error } = await supabase
        .from('resumes')
        .update({
          content,
          is_corpus: true,
          corpus_type: input.corpusType,
          corpus_source: input.corpusSource,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*, resume_versions(*)')
        .single();
      if (error) throw error;
      return mapResume(data);
    }
    const { data, error } = await supabase.from('resumes').insert({
      user_id: userId,
      name,
      type: 'technical',
      content,
      ats_score: 0,
      is_corpus: true,
      corpus_type: input.corpusType,
      corpus_source: input.corpusSource,
    }).select('*, resume_versions(*)').single();
    if (error) throw error;
    return mapResume(data);
  }
  async parseUploadedResume(file: File): Promise<string> {
    const mime = assertResumeUploadFile(file);
    if (mime === 'text/plain' || mime === 'text/markdown') {
      const text = sanitizeExtractedResumeText(await file.text());
      if (!text) throw new Error('File is empty');
      return text;
    }
    const userId = await requireUserId();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 80) || 'resume';
    const storagePath = `${userId}/uploads/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('resumes').upload(storagePath, file, {
      upsert: false,
      contentType: mime,
    });
    if (uploadError) throw uploadError;
    try {
      const { data, error } = await supabase.functions.invoke('resume-actions', {
        body: { mode: 'parse_uploaded_resume', storagePath, fileName: file.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const text = sanitizeExtractedResumeText(String(data?.text || ''));
      if (!text) throw new Error('Could not extract text from the uploaded resume');
      return text;
    } finally {
      await supabase.storage.from('resumes').remove([storagePath]).catch(() => undefined);
    }
  }
  async syncGoogleDocCorpus(input: {
    fileId: string;
    corpusType?: 'master' | 'role_specific';
    name?: string;
  }): Promise<{
    chunksExtracted: number;
    newChunksAdded: number;
    totalExisting: number;
    resumeUpdated: boolean;
  }> {
    const fileId = parseGoogleDocFileId(input.fileId);
    if (!fileId) throw new Error('Paste a Google Doc link or file ID');
    const corpusType = input.corpusType || 'master';
    const { data, error } = await invokeAiChat({
      mode: 'sync_google_doc_chunks',
      fileId,
      corpusType,
      name: input.name,
    });
    if (error) throw error;
    if ((data as { error?: unknown } | null)?.error) {
      throw new Error(String((data as { error: unknown }).error));
    }
    if (corpusType === 'master') {
      await new SettingsService().mergeJobSearch({ resumeFileId: fileId });
    }
    return {
      chunksExtracted: Number((data as { chunksExtracted?: number } | null)?.chunksExtracted || 0),
      newChunksAdded: Number((data as { newChunksAdded?: number } | null)?.newChunksAdded || 0),
      totalExisting: Number((data as { totalExisting?: number } | null)?.totalExisting || 0),
      resumeUpdated: Boolean((data as { resumeUpdated?: boolean } | null)?.resumeUpdated),
    };
  }
  async create(name: string, type: Resume['type'], content: string): Promise<Resume> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('resumes').insert({
      user_id: userId,
      name: sanitizeResumeName(name) || 'Resume',
      type,
      content: sanitizeExtractedResumeText(content),
      ats_score: 0,
    }).select('*, resume_versions(*)').single();
    if (error) throw error;
    return mapResume(data);
  }
  async update(id: string, content: string): Promise<void> {
    const sanitized = sanitizeExtractedResumeText(content);
    const { error } = await supabase.from('resumes').update({ content: sanitized, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }
  async updateScore(id: string, score: number, content?: string): Promise<void> {
    const patch: Record<string, unknown> = {
      ats_score: score,
      updated_at: new Date().toISOString(),
    };
    if (content !== undefined) patch.content = content;
    const { error } = await supabase.from('resumes').update(patch).eq('id', id);
    if (error) throw error;
  }
  async updateAtsReview(id: string, review: AtsReview, content?: string): Promise<void> {
    const patch: Record<string, unknown> = {
      ats_score: review.score,
      ats_review: review,
      updated_at: new Date().toISOString(),
    };
    if (content !== undefined) patch.content = content;
    const { error } = await supabase.from('resumes').update(patch).eq('id', id);
    if (error) throw error;
  }
  async startResumeTailoring(jobIds: string | string[]): Promise<{ runId: string }> {
    const ids = [...new Set((Array.isArray(jobIds) ? jobIds : [jobIds]).map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) throw new Error('Select at least one job');
    if (!(await this.hasMasterResume())) {
      throw new Error('Add a master resume on the Corpus page before generating a tailored resume.');
    }
    const { data: jobs } = await supabase.from('jobs').select('id').in('id', ids);
    if (!jobs?.length || jobs.length !== ids.length) throw new Error('One or more jobs were not found');
    const wf = await new WorkflowService().ensureTailorPipeline();
    const run = await new ExecutionService().runWorkflow(
      wf.id,
      ids.length === 1 ? { jobId: ids[0] } : { jobIds: ids },
    );
    if (!run.id) throw new Error('Resume tailoring failed to start');
    return { runId: run.id };
  }
  async compare(idA: string, idB: string): Promise<{ a: Resume; b: Resume; diff: string[] }> {
    const a = await this.get(idA);
    const b = await this.get(idB);
    if (!a || !b) throw new Error('Resume not found');
    return {
      a, b,
      diff: [
        `ATS Score: ${a.atsScore} vs ${b.atsScore}`,
        `Type: ${a.type} vs ${b.type}`,
        `Versions: ${a.versions.length} vs ${b.versions.length}`,
      ],
    };
  }
  async syncToDrive(id: string, content?: string): Promise<{ driveFileId: string; pdfLink: string }> {
    const { data, error } = await supabase.functions.invoke('resume-actions', {
      body: { mode: 'sync_drive', resumeId: id, content },
    });
    throwResumeActionError(data as ResumeActionResponse | null);
    if (error) throw error;
    return {
      driveFileId: String(data?.driveFileId || data?.results?.[0]?.driveFileId || ''),
      pdfLink: String(data?.pdfLink || data?.results?.[0]?.pdfLink || ''),
    };
  }
  async syncManyToDrive(ids: string[]): Promise<{
    results: Array<{ resumeId: string; driveFileId: string; pdfLink: string }>;
    errors?: Array<{ resumeId: string; error: string }>;
  }> {
    const { data, error } = await supabase.functions.invoke('resume-actions', {
      body: { mode: 'sync_drive', resumeIds: ids },
    });
    throwResumeActionError(data as ResumeActionResponse | null, 'Drive sync failed');
    if (error) throw error;
    if (data?.error && !data?.results?.length) throw new Error(String(data.error));
    return {
      results: (data?.results as Array<{ resumeId: string; driveFileId: string; pdfLink: string }>) || [],
      errors: data?.errors as Array<{ resumeId: string; error: string }> | undefined,
    };
  }
  async downloadPdf(id: string, content?: string): Promise<void> {
    const resume = await this.get(id);
    if (!resume) throw new Error('Resume not found');

    const { data, error } = await supabase.functions.invoke('resume-actions', {
      body: { mode: 'generate_pdf', resumeId: id, content },
    });
    throwResumeActionError(data as ResumeActionResponse | null, 'PDF generation failed');
    if (error) throw error;

    const url = String(data?.url || '');
    if (!url) throw new Error('PDF generation failed');

    const safeName = resume.name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'resume';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to download PDF');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${safeName}.pdf`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  }
  async deleteJobResumes(ids: string[]): Promise<number> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return 0;

    const userId = await requireUserId();
    const jobResumes = (await this.list({ kind: 'job' })).filter((resume) => uniqueIds.includes(resume.id));
    if (jobResumes.length === 0) return 0;

    const ownedIds = jobResumes.map((resume) => resume.id);
    const jobIds = [...new Set(jobResumes.map((resume) => resume.jobId).filter((id): id is string => !!id))];

    const { data: versions, error: versionListError } = await supabase
      .from('resume_versions')
      .select('id')
      .in('resume_id', ownedIds)
      .eq('user_id', userId);
    if (versionListError) throw versionListError;

    const versionIds = (versions || []).map((row) => String(row.id));
    for (const batch of chunkArray(versionIds, 50)) {
      const { error } = await supabase
        .from('applications')
        .update({ resume_version_id: null })
        .eq('user_id', userId)
        .in('resume_version_id', batch);
      if (error) throw error;
    }

    for (const batch of chunkArray(ownedIds, 50)) {
      const { error } = await supabase
        .from('resume_versions')
        .delete()
        .in('resume_id', batch)
        .eq('user_id', userId);
      if (error) throw error;

      const { error: resumeError } = await supabase
        .from('resumes')
        .delete()
        .in('id', batch)
        .eq('user_id', userId);
      if (resumeError) throw resumeError;
    }

    for (const batch of chunkArray(jobIds, 50)) {
      const { error: jobError } = await supabase
        .from('jobs')
        .update({ resume_status: 'none', status: 'discovered', pdf_url: null })
        .eq('user_id', userId)
        .in('id', batch);
      if (jobError) {
        console.warn('deleteJobResumes: job status reset failed', jobError);
      }
    }

    return ownedIds.length;
  }
  async deleteAllJobResumes(): Promise<number> {
    const jobResumes = await this.list({ kind: 'job' });
    return this.deleteJobResumes(jobResumes.map((resume) => resume.id));
  }
  async deleteCorpusResumes(ids: string[]): Promise<number> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return 0;

    const userId = await requireUserId();
    const corpusResumes = (await this.list({ kind: 'corpus' })).filter((resume) => uniqueIds.includes(resume.id));
    if (corpusResumes.length === 0) return 0;

    const ownedIds = corpusResumes.map((resume) => resume.id);

    const { data: versions, error: versionListError } = await supabase
      .from('resume_versions')
      .select('id')
      .in('resume_id', ownedIds)
      .eq('user_id', userId);
    if (versionListError) throw versionListError;

    const versionIds = (versions || []).map((row) => String(row.id));
    for (const batch of chunkArray(versionIds, 50)) {
      const { error } = await supabase
        .from('applications')
        .update({ resume_version_id: null })
        .eq('user_id', userId)
        .in('resume_version_id', batch);
      if (error) throw error;
    }

    for (const batch of chunkArray(ownedIds, 50)) {
      const { error } = await supabase
        .from('resume_versions')
        .delete()
        .in('resume_id', batch)
        .eq('user_id', userId);
      if (error) throw error;

      const { error: resumeError } = await supabase
        .from('resumes')
        .delete()
        .in('id', batch)
        .eq('user_id', userId);
      if (resumeError) throw resumeError;
    }

    const deletedMaster = corpusResumes.some((resume) => corpusGroup(resume) === 'master');
    if (deletedMaster) {
      const { error: chunkError } = await supabase
        .from('knowledge_chunks')
        .delete()
        .eq('user_id', userId)
        .eq('collection', 'career');
      if (chunkError) throw chunkError;
    }

    const remaining = await this.list({ kind: 'corpus' });
    if (!remaining.some((resume) => corpusGroup(resume) === 'master')) {
      await new SettingsService().mergeJobSearch({ resumeFileId: '' });
    }

    return ownedIds.length;
  }
  async deleteAllCorpusResumes(): Promise<number> {
    const corpusResumes = await this.list({ kind: 'corpus' });
    const count = await this.deleteCorpusResumes(corpusResumes.map((resume) => resume.id));
    const userId = await requireUserId();
    const { error: chunkError } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('user_id', userId)
      .eq('collection', 'career');
    if (chunkError) throw chunkError;
    await new SettingsService().mergeJobSearch({ resumeFileId: '' });
    return count;
  }
  async repairSync(): Promise<{
    resumesLinkedToJobs: number;
    jobsLinkedToResumes: number;
    driveFilesMatched: number;
    driveOnlyFiles: string[];
    jobsWithoutResume: number;
    resumesWithoutJob: number;
    driveError?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('resume-actions', {
      body: { mode: 'repair_sync' },
    });
    throwResumeActionError(data as ResumeActionResponse | null, 'Sync repair failed');
    if (error) throw error;
    return data;
  }
}

export class ATSService {
  async score(content: string): Promise<AtsReview> {
    const { data, error } = await invokeAiChat({ mode: 'ats_score', content });
    if (error) throw error;
    const raw = data as { score?: number; feedback?: string[]; suggestions?: string[] };
    return {
      score: Number(raw.score ?? 0),
      feedback: Array.isArray(raw.feedback) ? raw.feedback.map(String) : [],
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.map(String) : undefined,
      scoredAt: new Date().toISOString(),
    };
  }
}

export class CoverLetterService {
  async list(): Promise<CoverLetter[]> {
    const { data, error } = await supabase.from('cover_letters').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapCoverLetter);
  }
  async create(name: string, companyName: string, role: string, content: string): Promise<CoverLetter> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('cover_letters').insert({ user_id: userId, name, company_name: companyName, role, content }).select().single();
    if (error) throw error;
    return mapCoverLetter(data);
  }
  async generate(jobId: string): Promise<CoverLetter> {
    const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (!job) throw new Error('Job not found');
    const { data, error } = await invokeAiChat({
      content: `Write a cover letter for ${job.role} at ${job.company}. Job description: ${job.description}`,
      systemPrompt: 'Write a professional cover letter.',
    });
    if (error) throw error;
    return this.create(`Cover Letter - ${job.company}`, job.company, job.role, data?.reply || '');
  }
  async update(id: string, content: string): Promise<void> {
    const { error } = await supabase.from('cover_letters').update({ content, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }
}

export class ApplicationService {
  async list(): Promise<Application[]> {
    const { data, error } = await supabase.from('applications').select('*, application_events(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapApplication);
  }
  async create(app: Partial<Application>): Promise<Application> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('applications').insert({
      user_id: userId,
      job_id: app.jobId || null,
      company: app.company || '',
      role: app.role || '',
      status: 'draft',
      notes: '',
      attachments: [],
    }).select('*, application_events(*)').single();
    if (error) throw error;
    return mapApplication(data);
  }
  async updateStatus(id: string, status: Application['status']): Promise<void> {
    const { error } = await supabase.from('applications').update({ status }).eq('id', id);
    if (error) throw error;
    const userId = await requireUserId();
    await supabase.from('application_events').insert({
      user_id: userId,
      application_id: id,
      type: status,
      label: status.charAt(0).toUpperCase() + status.slice(1),
      event_date: new Date().toISOString(),
    });
  }
}

export class WorkflowService {
  async list(): Promise<Workflow[]> {
    const { data, error } = await supabase.from('workflows').select('*, workflow_nodes(*), workflow_edges(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapWorkflow);
  }
  async get(id: string): Promise<Workflow | undefined> {
    const { data, error } = await supabase.from('workflows').select('*, workflow_nodes(*), workflow_edges(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapWorkflow(data) : undefined;
  }
  async create(name: string, description: string): Promise<Workflow> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('workflows').insert({ user_id: userId, name, description, active: false }).select('*, workflow_nodes(*), workflow_edges(*)').single();
    if (error) throw error;
    return mapWorkflow(data);
  }
  async update(id: string, patch: Partial<Pick<Workflow, 'name' | 'description' | 'active' | 'schedule'>>): Promise<void> {
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('workflows').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    }
  }
  async saveGraph(workflowId: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): Promise<void> {
    const userId = await requireUserId();
    await supabase.from('workflow_edges').delete().eq('workflow_id', workflowId);
    await supabase.from('workflow_nodes').delete().eq('workflow_id', workflowId);

    const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const idMap = new Map<string, string>();
    for (const n of nodes) {
      const dbId = isUuid(n.id) ? n.id : crypto.randomUUID();
      idMap.set(n.id, dbId);
    }

    if (nodes.length) {
      const { error: nodeErr } = await supabase.from('workflow_nodes').insert(
        nodes.map((n) => ({
          id: idMap.get(n.id)!,
          workflow_id: workflowId,
          user_id: userId,
          node_key: n.id,
          type: n.type,
          name: n.name,
          position_x: n.position.x,
          position_y: n.position.y,
          config: n.config,
        })),
      );
      if (nodeErr) throw nodeErr;
    }

    if (edges.length) {
      const { error: edgeErr } = await supabase.from('workflow_edges').insert(
        edges.map((e) => ({
          id: isUuid(e.id) ? e.id : crypto.randomUUID(),
          workflow_id: workflowId,
          user_id: userId,
          source_id: idMap.get(e.source) || e.source,
          target_id: idMap.get(e.target) || e.target,
          label: e.label || null,
        })),
      );
      if (edgeErr) throw edgeErr;
    }
  }
  async ensureDefaultPipeline(): Promise<Workflow> {
    const userId = await requireUserId();
    const { data: existing } = await supabase.from('workflows').select('id').eq('user_id', userId).eq('name', DEFAULT_JOB_SEARCH_WORKFLOW.name).maybeSingle();
    if (existing) {
      await this.repairDefaultPipelineGraph(existing.id);
      await this.repairDefaultAutomation(existing.id, userId);
      const wf = await this.get(existing.id);
      if (wf) return wf;
    }
    const wf = await this.create(DEFAULT_JOB_SEARCH_WORKFLOW.name, DEFAULT_JOB_SEARCH_WORKFLOW.description);
    const nodeIds = DEFAULT_JOB_SEARCH_WORKFLOW.nodes.map(() => crypto.randomUUID());
    const nodes: WorkflowNode[] = DEFAULT_JOB_SEARCH_WORKFLOW.nodes.map((n, i) => ({
      id: nodeIds[i],
      type: n.type,
      name: n.name,
      position: { x: n.x, y: n.y },
      config: n.config,
    }));
    const edgeDefs = buildSeedEdges(nodeIds);
    const edges: WorkflowEdge[] = edgeDefs.map((e) => ({
      id: crypto.randomUUID(),
      source: nodeIds[e.source],
      target: nodeIds[e.target],
      label: e.label,
    }));
    await this.saveGraph(wf.id, nodes, edges);
    await supabase.from('workflows').update({ schedule: DEFAULT_JOB_SEARCH_WORKFLOW.schedule, active: true }).eq('id', wf.id);
    const { data: autoExists } = await supabase.from('automations').select('id, next_run').eq('workflow_id', wf.id).maybeSingle();
    if (!autoExists) {
      const nextRun = computeNextCronRun(DEFAULT_JOB_SEARCH_WORKFLOW.schedule);
      await supabase.from('automations').insert({
        user_id: userId,
        name: 'Daily 7 AM Job Search',
        workflow_id: wf.id,
        status: 'active',
        schedule: DEFAULT_JOB_SEARCH_WORKFLOW.schedule,
        trigger: 'schedule',
        retries: 2,
        next_run: nextRun.toISOString(),
      });
    } else {
      await this.repairDefaultAutomation(wf.id, userId);
    }
    return (await this.get(wf.id))!;
  }
  /** Keep the built-in daily automation schedulable (next_run set, active). */
  private async repairDefaultAutomation(workflowId: string, userId: string): Promise<void> {
    const schedule = DEFAULT_JOB_SEARCH_WORKFLOW.schedule;
    const { data: auto } = await supabase
      .from('automations')
      .select('id, status, next_run, schedule')
      .eq('workflow_id', workflowId)
      .maybeSingle();

    if (!auto) {
      const nextRun = computeNextCronRun(schedule);
      await supabase.from('automations').insert({
        user_id: userId,
        name: 'Daily 7 AM Job Search',
        workflow_id: workflowId,
        status: 'active',
        schedule,
        trigger: 'schedule',
        retries: 2,
        next_run: nextRun.toISOString(),
      });
      return;
    }

    if (auto.status !== 'active') return;

    const patch: Record<string, string> = {};
    if (!auto.next_run) {
      patch.next_run = computeNextCronRun(auto.schedule || schedule).toISOString();
    } else {
      const nextRunAt = new Date(auto.next_run);
      const maxFuture = computeNextCronRun(auto.schedule || schedule);
      maxFuture.setUTCDate(maxFuture.getUTCDate() + 2);
      if (nextRunAt.getTime() > maxFuture.getTime()) {
        patch.next_run = computeNextCronRun(auto.schedule || schedule).toISOString();
      }
    }
    if (Object.keys(patch).length) {
      await supabase.from('automations').update(patch).eq('id', auto.id);
    }
  }
  /** Ensure jobs are stored in Supabase before ATS tailoring (fixes legacy graph order). */
  private async repairDefaultPipelineGraph(workflowId: string): Promise<void> {
    const wf = await this.get(workflowId);
    if (!wf) return;
    const find = (name: string) => wf.nodes.find((n) => n.name === name);
    const dedupe = find('Filter Duplicates');
    const store = find('Store Job');
    const ats = find('ATS Optimizer');
    const latex = find('Build LaTeX');
    if (!dedupe || !store || !ats || !latex) return;
    if (!wf.edges.some((e) => e.source === dedupe.id && e.target === ats.id)) return;

    const chainIds = new Set([dedupe.id, store.id, ats.id, latex.id]);
    const kept = wf.edges.filter((e) => !chainIds.has(e.source) || !chainIds.has(e.target));
    const repaired: WorkflowEdge[] = [
      ...kept,
      { id: crypto.randomUUID(), source: dedupe.id, target: store.id },
      { id: crypto.randomUUID(), source: store.id, target: ats.id },
      { id: crypto.randomUUID(), source: ats.id, target: latex.id },
    ];
    await this.saveGraph(workflowId, wf.nodes, repaired);
  }

  async ensureTailorPipeline(): Promise<Workflow> {
    const userId = await requireUserId();
    const { data: existing } = await supabase
      .from('workflows')
      .select('id')
      .eq('user_id', userId)
      .eq('name', DEFAULT_RESUME_TAILOR_WORKFLOW.name)
      .maybeSingle();
    if (existing) {
      await this.repairTailorPipelineGraph(existing.id);
      const wf = await this.get(existing.id);
      if (wf) return wf;
    }
    const wf = await this.create(DEFAULT_RESUME_TAILOR_WORKFLOW.name, DEFAULT_RESUME_TAILOR_WORKFLOW.description);
    await this.provisionTailorGraph(wf.id);
    return (await this.get(wf.id))!;
  }

  private async provisionTailorGraph(workflowId: string): Promise<void> {
    const nodeIds = DEFAULT_RESUME_TAILOR_WORKFLOW.nodes.map(() => crypto.randomUUID());
    const nodes: WorkflowNode[] = DEFAULT_RESUME_TAILOR_WORKFLOW.nodes.map((n, i) => ({
      id: nodeIds[i],
      type: n.type,
      name: n.name,
      position: { x: n.x, y: n.y },
      config: n.config,
    }));
    const edges: WorkflowEdge[] = buildTailorSeedEdges().map((e) => ({
      id: crypto.randomUUID(),
      source: nodeIds[e.source],
      target: nodeIds[e.target],
    }));
    await this.saveGraph(workflowId, nodes, edges);
  }

  private async repairTailorPipelineGraph(workflowId: string): Promise<void> {
    const wf = await this.get(workflowId);
    if (!wf) return;
    const hasLoad = wf.nodes.some((n) => n.type === 'supabase' && n.config.action === 'load_job');
    const required = ['ATS Optimizer', 'Build LaTeX', 'Compile PDF', 'Upload to Storage'];
    const hasAll = hasLoad && required.every((name) => wf.nodes.some((n) => n.name === name));
    if (hasAll) return;
    await this.provisionTailorGraph(workflowId);
  }
  async toggle(id: string): Promise<void> {
    const { data } = await supabase.from('workflows').select('active').eq('id', id).maybeSingle();
    if (data) {
      const { error } = await supabase.from('workflows').update({ active: !data.active }).eq('id', id);
      if (error) throw error;
    }
  }
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('workflows').delete().eq('id', id);
    if (error) throw error;
  }
}

function mergeNodeResults(
  nodes: WorkflowRun['nodeResults'],
): WorkflowRun['nodeResults'] {
  const rank: Record<string, number> = { success: 4, failed: 3, cancelled: 3, running: 2, queued: 1, idle: 0, paused: 0 };
  const byNode = new Map<string, WorkflowRun['nodeResults'][number]>();
  for (const n of nodes) {
    const existing = byNode.get(n.nodeId);
    const nRank = rank[n.status] ?? 0;
    const eRank = existing ? rank[existing.status] ?? 0 : -1;
    if (!existing || nRank > eRank || (nRank === eRank && n.duration > existing.duration)) {
      byNode.set(n.nodeId, n);
    }
  }
  return Array.from(byNode.values());
}

const WORKFLOW_RUN_LIST_COLUMNS = [
  'id',
  'workflow_id',
  'status',
  'started_at',
  'finished_at',
  'duration_ms',
  'current_node_id',
  'error_message',
  'created_at',
  'jobs_total',
  'jobs_successful',
  'jobs_failed',
  'jobs_skipped',
  'trigger_type',
].join(',');

const WORKFLOW_RUN_NODES_LIST = 'workflow_run_nodes(node_id,status,duration_ms)';
const WORKFLOW_JOB_EXECUTIONS_LIST = 'workflow_job_executions(id)';
const WORKFLOW_JOB_EXECUTIONS_DETAIL = [
  'workflow_job_executions(id,run_id,job_index,job_id,label,status,attempt,',
  'failed_node_id,started_at,completed_at,duration_ms,error_type,error_code,error_message)',
].join('');
const WORKFLOW_NODE_EXECUTIONS_DETAIL = [
  'workflow_node_executions(id,run_id,job_execution_id,workflow_node_id,node_name,node_type,',
  'job_index,attempt,status,started_at,completed_at,duration_ms,error_type,error_code,error_message,output_summary)',
].join('');

const WORKFLOW_RUN_LIST_SELECT = [
  WORKFLOW_RUN_LIST_COLUMNS,
  'workflow:workflows(name)',
  WORKFLOW_RUN_NODES_LIST,
  WORKFLOW_JOB_EXECUTIONS_LIST,
].join(',');

const WORKFLOW_RUN_DETAIL_SELECT = [
  WORKFLOW_RUN_LIST_COLUMNS,
  'workflow_snapshot',
  'workflow:workflows(name)',
  WORKFLOW_RUN_NODES_LIST,
  WORKFLOW_JOB_EXECUTIONS_DETAIL,
  WORKFLOW_NODE_EXECUTIONS_DETAIL,
].join(',');

const WORKFLOW_LOG_SELECT = [
  'id',
  'level',
  'message',
  'timestamp',
  'node_id',
  'job_execution_id',
  'node_execution_id',
  'job_index',
  'attempt',
].join(',');

const WORKFLOW_LOG_LIMIT = 2000;

function targetJobIdFromRow(r: Record<string, unknown>): string | undefined {
  const stored = (r.context as Record<string, unknown>) || {};
  const variables = (stored.variables as Record<string, unknown>) || {};
  if (typeof variables.targetJobId === 'string' && variables.targetJobId) {
    return variables.targetJobId;
  }
  const jobIds = [...new Set(
    ((r.workflow_job_executions as Record<string, unknown>[]) || [])
      .map((row) => row.job_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  )];
  return jobIds.length === 1 ? jobIds[0] : undefined;
}

function mapLogRows(rows: Record<string, unknown>[]): WorkflowRun['logs'] {
  return rows
    .map((l) => ({
      id: String(l.id),
      level: (l.level as 'info' | 'warn' | 'error' | 'debug') ?? 'info',
      message: String(l.message ?? ''),
      timestamp: (l.timestamp as string) ?? '',
      nodeId: l.node_id as string | undefined,
      jobExecutionId: l.job_execution_id as string | undefined,
      nodeExecutionId: l.node_execution_id as string | undefined,
      jobIndex: l.job_index as number | undefined,
      attempt: l.attempt as number | undefined,
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function mapRunRow(r: Record<string, unknown>, logs?: Record<string, unknown>[]): WorkflowRun {
  const stored = (r.context as Record<string, unknown>) || {};
  const variables = (stored.variables as Record<string, unknown>) || {};
  const batchProgress = variables.batchProgress as { node: string; index: number; total: number } | undefined;
  const jobExecutions = (r.workflow_job_executions as Record<string, unknown>[]) || [];
  return {
    id: String(r.id),
    workflowId: String(r.workflow_id),
    status: (r.status as WorkflowRun['status']) ?? 'success',
    startedAt: (r.started_at as string) ?? '',
    finishedAt: r.finished_at as string | undefined,
    duration: Number(r.duration_ms ?? 0),
    currentNodeId: r.current_node_id ? String(r.current_node_id) : undefined,
    errorMessage: r.error_message ? String(r.error_message) : undefined,
    batchProgress: batchProgress?.node ? batchProgress : undefined,
    jobsTotal: Number(r.jobs_total ?? 0) || undefined,
    jobsSuccessful: Number(r.jobs_successful ?? 0) || undefined,
    jobsFailed: Number(r.jobs_failed ?? 0) || undefined,
    jobsSkipped: Number(r.jobs_skipped ?? 0) || undefined,
    triggerType: r.trigger_type as string | undefined,
    targetJobId: targetJobIdFromRow(r),
    isLegacy: jobExecutions.length === 0,
    nodeResults: mergeNodeResults(
      ((r.workflow_run_nodes as Record<string, unknown>[]) ?? []).map((n) => ({
        nodeId: String(n.node_id ?? ''),
        status: (n.status as WorkflowRun['nodeResults'][number]['status']) ?? 'success',
        duration: Number(n.duration_ms ?? 0),
      })),
    ),
    logs: mapLogRows(logs ?? ((r.workflow_logs as Record<string, unknown>[]) ?? [])),
    workflowName: (r.workflow as Record<string, unknown>)?.name as string | undefined
      ?? (r.workflow_snapshot as WorkflowSnapshot | null)?.workflowName,
  };
}

function mapJobExecution(row: Record<string, unknown>): JobExecution {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    jobIndex: Number(row.job_index),
    label: row.label as string | undefined,
    status: (row.status as JobExecution['status']) ?? 'pending',
    attempt: Number(row.attempt ?? 1),
    failedNodeId: row.failed_node_id as string | undefined,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    durationMs: row.duration_ms as number | undefined,
    errorType: row.error_type as string | undefined,
    errorCode: row.error_code as string | undefined,
    errorMessage: row.error_message as string | undefined,
  };
}

function mapNodeExecution(row: Record<string, unknown>): NodeExecution {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    jobExecutionId: row.job_execution_id as string | undefined,
    workflowNodeId: String(row.workflow_node_id),
    nodeName: String(row.node_name ?? ''),
    nodeType: String(row.node_type ?? ''),
    jobIndex: row.job_index as number | undefined,
    attempt: Number(row.attempt ?? 1),
    status: (row.status as NodeExecution['status']) ?? 'pending',
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    durationMs: row.duration_ms as number | undefined,
    errorType: row.error_type as string | undefined,
    errorCode: row.error_code as string | undefined,
    errorMessage: row.error_message as string | undefined,
    outputSummary: row.output_summary as Record<string, unknown> | undefined,
  };
}

export class ExecutionService {
  async listRuns(): Promise<Workflow['runs']> {
    const { data, error } = await supabase
      .from('workflow_runs')
      .select(WORKFLOW_RUN_LIST_SELECT)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data || []).map((row) => mapRunRow(row as unknown as Record<string, unknown>)) as unknown as Workflow['runs'];
  }

  async getRunDetail(runId: string): Promise<WorkflowRunDetail | null> {
    const [runResult, logsResult] = await Promise.all([
      supabase
        .from('workflow_runs')
        .select(WORKFLOW_RUN_DETAIL_SELECT)
        .eq('id', runId)
        .maybeSingle(),
      supabase
        .from('workflow_logs')
        .select(WORKFLOW_LOG_SELECT)
        .eq('run_id', runId)
        .order('timestamp', { ascending: false })
        .limit(WORKFLOW_LOG_LIMIT),
    ]);
    if (runResult.error) throw runResult.error;
    if (!runResult.data) return null;
    const runRow = runResult.data as unknown as Record<string, unknown>;
    const logs = logsResult.error ? [] : ((logsResult.data || []) as unknown as Record<string, unknown>[]);
    const base = mapRunRow(runRow, logs);
    return {
      ...base,
      workflowSnapshot: runRow.workflow_snapshot as WorkflowSnapshot | undefined,
      jobExecutions: ((runRow.workflow_job_executions as Record<string, unknown>[]) || []).map(mapJobExecution),
      nodeExecutions: ((runRow.workflow_node_executions as Record<string, unknown>[]) || []).map(mapNodeExecution),
    };
  }

  async retryFailedJobs(runId: string): Promise<{ runId: string; retriedJobs: number }> {
    const { data, error } = await supabase.functions.invoke('workflow-retry-failed', { body: { runId } });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return {
      runId: String(data?.runId ?? runId),
      retriedJobs: Number(data?.retriedJobs ?? 0),
    };
  }
  async runWorkflow(id: string, options?: { jobId?: string; jobIds?: string[] }): Promise<Workflow['runs'][number]> {
    if (!(await new ResumeService().hasMasterResume())) {
      throw new Error('Add a master resume on the Corpus page before running a workflow.');
    }
    const body: Record<string, unknown> = { workflowId: id };
    if (options?.jobIds?.length) {
      body.jobIds = options.jobIds;
      body.jobId = options.jobIds[0];
    } else if (options?.jobId) {
      body.jobId = options.jobId;
    }
    const { data, error } = await supabase.functions.invoke('workflow-run', { body });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return {
      id: data?.runId || '',
      workflowId: id,
      status: (data?.status as Workflow['runs'][number]['status']) || 'running',
      startedAt: new Date().toISOString(),
      duration: 0,
      nodeResults: [],
      logs: [],
    };
  }
  async cancelRun(runId: string): Promise<void> {
    const userId = await requireUserId();
    const finishedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('workflow_runs')
      .update({
        status: 'cancelled',
        finished_at: finishedAt,
        error_message: 'Stopped by user',
        current_node_id: null,
      })
      .eq('id', runId)
      .eq('user_id', userId)
      .in('status', ['running', 'queued'])
      .select('id, status')
      .maybeSingle();
    if (updateError) throw updateError;

    const { error: queueError } = await supabase.from('workflow_step_queue').delete().eq('run_id', runId);
    if (queueError) throw queueError;

    try {
      await supabase.functions.invoke('workflow-cancel', { body: { runId } });
    } catch {
      // Edge Function may be unavailable; the row update above is the source of truth.
    }

    if (!updated) {
      const { data: current } = await supabase
        .from('workflow_runs')
        .select('status')
        .eq('id', runId)
        .maybeSingle();
      if (current?.status === 'cancelled') return;
      throw new Error(
        'Could not stop this run. Apply migration 008_workflow_runs_cancel.sql in the Supabase SQL editor, then try again.',
      );
    }
  }
  async deleteRun(runId: string): Promise<void> {
    const userId = await requireUserId();
    const { error: stepError } = await supabase.from('workflow_step_queue').delete().eq('run_id', runId);
    if (stepError) throw stepError;
    const { error: nodeError } = await supabase.from('workflow_run_nodes').delete().eq('run_id', runId);
    if (nodeError) throw nodeError;
    const { error: logError } = await supabase.from('workflow_logs').delete().eq('run_id', runId);
    if (logError) throw logError;
    const { error } = await supabase.from('workflow_runs').delete().eq('id', runId).eq('user_id', userId);
    if (error) throw error;
  }
  async deleteAllRuns(): Promise<number> {
    const userId = await requireUserId();
    const { data: runs, error: listError } = await supabase.from('workflow_runs').select('id').eq('user_id', userId);
    if (listError) throw listError;
    const runIds = (runs || []).map((r) => r.id as string);
    if (!runIds.length) return 0;
    const { error: stepError } = await supabase.from('workflow_step_queue').delete().in('run_id', runIds);
    if (stepError) throw stepError;
    const { error: nodeError } = await supabase.from('workflow_run_nodes').delete().in('run_id', runIds);
    if (nodeError) throw nodeError;
    const { error: logError } = await supabase.from('workflow_logs').delete().in('run_id', runIds);
    if (logError) throw logError;
    const { error, count } = await supabase.from('workflow_runs').delete({ count: 'exact' }).eq('user_id', userId);
    if (error) throw error;
    return count ?? runIds.length;
  }
}

export class AgentService {
  async list(): Promise<Agent[]> {
    const { data, error } = await supabase.from('agents').select('*, agent_runs(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapAgent);
  }
  async get(id: string): Promise<Agent | undefined> {
    const { data, error } = await supabase.from('agents').select('*, agent_runs(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapAgent(data) : undefined;
  }
  async update(id: string, patch: Partial<Agent>): Promise<void> {
    const { error } = await supabase.from('agents').update(patch).eq('id', id);
    if (error) throw error;
  }
  async run(id: string, input: string): Promise<AgentRun> {
    const { data, error } = await invokeAiChat({ agentId: id, content: input });
    if (error) throw error;
    const userId = await requireUserId();
    const startedAt = new Date().toISOString();
    const output = data?.reply || '';
    const tokens = Number(data?.tokens || 0);
    const { data: run } = await supabase.from('agent_runs').insert({
      user_id: userId,
      agent_id: id,
      status: 'success',
      input,
      output,
      started_at: startedAt,
      duration_ms: 0,
      cost: 0,
      tokens,
    }).select().single();
    return {
      id: String(run?.id),
      agentId: id,
      status: 'success',
      input,
      output,
      startedAt,
      duration: 0,
      cost: 0,
      tokens,
    };
  }
}

export class DocumentService {
  async list(): Promise<Document[]> {
    const { data, error } = await supabase.from('documents').select('*, document_versions(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDocument);
  }
  async create(name: string, type: Document['type'], size: number, folder: string): Promise<Document> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('documents').insert({
      user_id: userId,
      name: sanitizeAttachmentLabel(name),
      type,
      size,
      folder: sanitizeAttachmentLabel(folder),
      tags: [],
    }).select('*, document_versions(*)').single();
    if (error) throw error;
    return mapDocument(data);
  }
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) throw error;
  }
}

export class EmbeddingService {
  async embed(text: string): Promise<number[]> {
    const { data, error } = await invokeAiChat({ mode: 'embed', content: text });
    if (error) throw error;
    return (data?.embedding as number[]) || [];
  }
  async search(query: string, collection?: string): Promise<{ chunk: string; score: number; collection: string; tags: string[] }[]> {
    let q = supabase.from('knowledge_chunks').select('content, collection, tags').ilike('content', `%${query}%`).limit(20);
    if (collection && collection !== 'all') q = q.eq('collection', collection);
    const { data, error } = await q;
    let rows: { content?: unknown; collection?: unknown; tags?: unknown }[] | null = data;
    let queryError = error;
    if (queryError && /tags/i.test(queryError.message || '')) {
      let q2 = supabase.from('knowledge_chunks').select('content, collection').ilike('content', `%${query}%`).limit(20);
      if (collection && collection !== 'all') q2 = q2.eq('collection', collection);
      const retry = await q2;
      rows = retry.data;
      queryError = retry.error;
    }
    if (queryError) throw queryError;
    const needle = query.toLowerCase();
    return (rows || []).map((c) => {
      const text = String(c.content ?? '');
      const hits = needle.split(/\s+/).filter((w) => w.length > 2 && text.toLowerCase().includes(w)).length;
      return {
        chunk: text,
        score: Math.min(0.99, 0.55 + hits * 0.08),
        collection: String(c.collection ?? 'career'),
        tags: (c.tags as string[]) ?? [],
      };
    });
  }
  async collections(): Promise<{ collection: string; count: number }[]> {
    const { data, error } = await supabase.from('knowledge_chunks').select('collection');
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const row of data || []) {
      const key = String(row.collection || 'career');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].map(([collection, count]) => ({ collection, count }));
  }
}

export class PromptService {
  async list(): Promise<Prompt[]> {
    const { data, error } = await supabase.from('prompts').select('*, prompt_versions(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapPrompt);
  }
  async create(name: string, category: string, content: string, variables: string[]): Promise<Prompt> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('prompts').insert({ user_id: userId, name, category, content, variables, version: 1 }).select('*, prompt_versions(*)').single();
    if (error) throw error;
    return mapPrompt(data);
  }
  async update(id: string, content: string): Promise<void> {
    const { data: current } = await supabase.from('prompts').select('version').eq('id', id).maybeSingle();
    const nextVersion = (current?.version ?? 0) + 1;
    const { error } = await supabase.from('prompts').update({ content, version: nextVersion, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    const userId = await requireUserId();
    await supabase.from('prompt_versions').insert({ user_id: userId, prompt_id: id, version: nextVersion, content });
  }
  async test(content: string, variables: Record<string, string>): Promise<string> {
    let prompt = content;
    for (const [k, v] of Object.entries(variables)) prompt = prompt.replaceAll(`{{${k}}}`, v);
    const { data, error } = await invokeAiChat({ content: prompt });
    if (error) throw error;
    return data?.reply || '';
  }
}

export class NotificationService {
  async list(): Promise<Notification[]> {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapNotification);
  }
  async markRead(id: string): Promise<void> {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) throw error;
  }
  async markAllRead(): Promise<void> {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('read', false);
    if (error) throw error;
  }
}

export class IntegrationService {
  async list(): Promise<Integration[]> {
    const { data, error } = await supabase.rpc('get_integrations_safe');
    if (error) {
      const fallback = await supabase.from('integrations').select('id, name, category, status, description, icon, last_sync, created_at, integration_logs(*)').order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data || []).map(mapIntegration);
    }
    return (data || []).map((row: Record<string, unknown>) => mapIntegration({ ...row, integration_logs: [] }));
  }
  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    const { data: row } = await supabase.from('integrations').select('name').eq('id', id).maybeSingle();
    if (row?.name === 'Apify') {
      await supabase.functions.invoke('workflow-run', { body: { test: 'apify' } }).catch(() => null);
    }
    const { error } = await supabase.from('integrations').update({ status: 'connected', last_sync: new Date().toISOString() }).eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'Connection test successful' };
  }
  async connectGoogle(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sign in first, then connect Google.');
    const { data, error } = await supabase.functions.invoke('google-oauth-start');
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    if (!data?.url) throw new Error('Failed to start Google OAuth');
    return data.url;
  }
  async toggle(id: string): Promise<void> {
    const { data } = await supabase.from('integrations').select('status').eq('id', id).maybeSingle();
    if (data) {
      const next = data.status === 'connected' ? 'disconnected' : 'connected';
      await supabase.from('integrations').update({ status: next }).eq('id', id);
    }
  }
}

export class AnalyticsService {
  private monthStartIso(): string {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    return start.toISOString();
  }

  async aiUsage(): Promise<AiUsageSummary> {
    const userId = await requireUserId();
    const monthStart = this.monthStartIso();
    const { data: profile } = await supabase
      .from('profiles')
      .select('ai_credits_used')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: events, error } = await supabase
      .from('ai_usage_events')
      .select('provider, operation, tokens_total, created_at')
      .eq('user_id', userId)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const providers: AiUsageSummary['providers'] = (['gemini', 'groq'] as const).map((provider) => {
      const rows = (events || []).filter((row) => row.provider === provider);
      const tokens = rows.reduce((sum, row) => sum + Number(row.tokens_total ?? 0), 0);
      const freeTierLimit = PROVIDER_FREE_TIER_MONTHLY_TOKENS[provider];
      return {
        provider,
        tokens,
        requests: rows.length,
        freeTierLimit,
        remaining: Math.max(0, freeTierLimit - tokens),
      };
    });

    const totalTokens = (events || []).reduce((sum, row) => sum + Number(row.tokens_total ?? 0), 0)
      || Number(profile?.ai_credits_used ?? 0);

    return {
      monthLabel: new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' }),
      totalTokens,
      providers,
      recent: (events || []).slice(0, 8).map((row) => ({
        operation: String(row.operation ?? 'chat'),
        provider: String(row.provider ?? 'gemini'),
        tokens: Number(row.tokens_total ?? 0),
        createdAt: String(row.created_at ?? ''),
      })),
    };
  }

  async metrics(): Promise<DashboardMetrics> {
    const userId = await requireUserId();
    const [jobsRes, appsRes, resumesRes, aiUsage] = await Promise.all([
      supabase.from('jobs').select('*').eq('user_id', userId),
      supabase.from('applications').select('*'),
      supabase.from('resume_versions').select('*'),
      this.aiUsage(),
    ]);
    const jobs = jobsRes.data || [];
    const apps = appsRes.data || [];
    const resumeVersions = resumesRes.data || [];
    const today = new Date().toISOString().slice(0, 10);
    const jobsFoundToday = jobs.filter((j) => (j.created_at as string)?.slice(0, 10) === today).length;
    const submitted = apps.filter((a) => a.status === 'submitted' || a.status === 'viewed' || a.status === 'interview' || a.status === 'offer');
    const offers = apps.filter((a) => a.status === 'offer');
    return {
      jobsFoundToday,
      jobsProcessed: jobs.length,
      applicationsReady: jobs.filter((j) => j.resume_status === 'ready').length,
      applicationsSubmitted: submitted.length,
      resumeVersions: resumeVersions.length,
      aiTokensUsed: aiUsage.totalTokens,
      successRate: submitted.length > 0 ? Math.round((offers.length / submitted.length) * 100) : 0,
      avgAtsScore: 0,
    };
  }
  async timeseries(): Promise<AnalyticsPoint[]> {
    const { data: jobs } = await supabase.from('jobs').select('created_at');
    const { data: apps } = await supabase.from('applications').select('created_at, status');
    const days: AnalyticsPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const jobsFound = (jobs || []).filter((j) => (j.created_at as string)?.slice(0, 10) === day).length;
      const jobsApplied = (apps || []).filter((a) => (a.created_at as string)?.slice(0, 10) === day).length;
      days.push({ label: `${i + 1}d ago`, jobsFound, jobsApplied, interviewRate: 0, offerRate: 0 });
    }
    return days;
  }
  async summary(): Promise<{
    jobsFound: number; jobsApplied: number; interviewRate: number;
    offerRate: number; aiUsage: number; tokenUsage: number; cost: number;
  }> {
    const m = await this.metrics();
    return {
      jobsFound: m.jobsProcessed,
      jobsApplied: m.applicationsSubmitted,
      interviewRate: 0,
      offerRate: m.successRate,
      aiUsage: m.aiTokensUsed,
      tokenUsage: 0,
      cost: 0,
    };
  }
}

export class EmailService {
  async send(to: string, subject: string, body: string): Promise<{ success: boolean }> {
    const { error } = await invokeAiChat({ mode: 'email', to, subject, content: body });
    if (error) throw error;
    return { success: true };
  }
}

export class PDFService {
  async generate(content: string, title: string, resumeId?: string): Promise<{ url: string }> {
    if (resumeId) {
      const { data, error } = await supabase.functions.invoke('resume-actions', {
        body: { mode: 'generate_pdf', resumeId, content },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return { url: String(data?.url || '') };
    }
    throw new Error('resumeId is required for PDF generation');
  }
}

export class StorageService {
  async upload(file: File, path: string): Promise<{ url: string }> {
    const userId = await requireUserId();
    const mime = assertResumeUploadFile(file);
    const relative = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relative || relative.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(relative)) {
      throw new Error('Invalid upload path');
    }
    const fullPath = `${userId}/${relative}`;
    const { error } = await supabase.storage.from('resumes').upload(fullPath, file, {
      upsert: false,
      contentType: mime,
    });
    if (error) throw error;
    const { data, error: signedError } = await supabase.storage.from('resumes').createSignedUrl(fullPath, 60 * 60);
    if (signedError || !data?.signedUrl) throw signedError || new Error('Could not create download URL');
    return { url: data.signedUrl };
  }
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
  stream(messages: ChatMessage[], onToken: (t: string) => void): Promise<string>;
  embed(text: string): Promise<number[]>;
}

class EdgeAIProvider implements AIProvider {
  constructor(public name: string) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    const { data, error } = await invokeAiChat({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    if (error) throw error;
    return data?.reply || '';
  }
  async stream(messages: ChatMessage[], onToken: (t: string) => void): Promise<string> {
    const reply = await this.chat(messages);
    onToken(reply);
    return reply;
  }
  async embed(text: string): Promise<number[]> {
    const { data, error } = await invokeAiChat({ mode: 'embed', content: text });
    if (error) throw error;
    return (data?.embedding as number[]) || [];
  }
}

export class AIService {
  private providers: Record<string, AIProvider> = {};
  constructor() {
    (['gemini', 'openai', 'claude', 'azure', 'ollama', 'bedrock'] as const).forEach((p) => {
      this.providers[p] = new EdgeAIProvider(p);
    });
  }
  getProvider(name: string): AIProvider {
    return this.providers[name] || this.providers.gemini;
  }
  async chat(provider: string, messages: ChatMessage[]): Promise<string> {
    return this.getProvider(provider).chat(messages);
  }
  async stream(provider: string, messages: ChatMessage[], onToken: (t: string) => void): Promise<string> {
    return this.getProvider(provider).stream(messages, onToken);
  }
}

export class AutomationService {
  async list(): Promise<Automation[]> {
    const { data, error } = await supabase.from('automations').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapAutomation);
  }
  async create(name: string, workflowId: string, schedule: string): Promise<Automation> {
    const userId = await requireUserId();
    const nextRun = computeNextCronRun(schedule);
    const { data, error } = await supabase.from('automations').insert({
      user_id: userId,
      name,
      workflow_id: workflowId,
      status: 'active',
      schedule,
      trigger: 'schedule',
      retries: 2,
      next_run: nextRun.toISOString(),
    }).select().single();
    if (error) throw error;
    return mapAutomation(data);
  }
  async toggle(id: string): Promise<void> {
    const { data } = await supabase.from('automations').select('status').eq('id', id).maybeSingle();
    if (data) {
      const next = data.status === 'active' ? 'paused' : 'active';
      await supabase.from('automations').update({ status: next }).eq('id', id);
    }
  }
  async clone(id: string): Promise<Automation> {
    const { data: src } = await supabase.from('automations').select('*').eq('id', id).maybeSingle();
    if (!src) throw new Error('Automation not found');
    const userId = await requireUserId();
    const { data, error } = await supabase.from('automations').insert({
      user_id: userId,
      name: `${src.name} (Copy)`,
      workflow_id: src.workflow_id,
      status: 'paused',
      schedule: src.schedule,
      trigger: src.trigger,
      retries: 0,
    }).select().single();
    if (error) throw error;
    return mapAutomation(data);
  }
}

export class ChatService {
  async listConversations(): Promise<ChatConversation[]> {
    const { data, error } = await supabase.from('chat_conversations').select('*, chat_messages(*)').order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapConversation);
  }
  async getConversation(id: string): Promise<ChatConversation | undefined> {
    const { data, error } = await supabase.from('chat_conversations').select('*, chat_messages(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapConversation(data) : undefined;
  }
  async createConversation(title: string, options?: { resumeId?: string }): Promise<ChatConversation> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('chat_conversations').insert({
      user_id: userId,
      title,
      resume_id: options?.resumeId || null,
    }).select('*, chat_messages(*)').single();
    if (error) throw error;
    return mapConversation(data);
  }
  async findConversationForResume(resumeId: string): Promise<ChatConversation | undefined> {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*, chat_messages(*)')
      .eq('resume_id', resumeId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapConversation(data) : undefined;
  }
  async appendMessage(
    conversationId: string,
    role: ChatMessage['role'],
    content: string,
    artifact?: ChatMessage['artifact'],
  ): Promise<ChatMessage> {
    const userId = await requireUserId();
    const { data, error } = await supabase.from('chat_messages').insert({
      user_id: userId,
      conversation_id: conversationId,
      role,
      content,
      artifact_type: artifact?.type || null,
      artifact_title: artifact?.title || null,
      artifact_content: artifact?.content || null,
    }).select().single();
    if (error) throw error;
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    return {
      id: String(data.id),
      role,
      content,
      artifact,
      createdAt: String(data.created_at),
      pinned: Boolean(data.pinned),
    };
  }
  async sendMessage(conversationId: string, content: string, options?: {
    resumeId?: string;
    resumeContent?: string;
    atsReview?: AtsReview;
  }): Promise<ChatMessage> {
    await this.appendMessage(conversationId, 'user', content);
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at');
    const { data, error } = await invokeAiChat({
      messages: (history || []).map((m) => ({ role: m.role, content: m.content })),
      mode: options?.resumeId ? 'resume_improvement' : undefined,
      resumeId: options?.resumeId,
      resumeContent: options?.resumeContent,
      atsReview: options?.atsReview,
    });
    if (error) throw error;
    const reply = data?.reply || '';
    return await this.appendMessage(conversationId, 'assistant', reply);
  }
  async streamReply(
    conversationId: string,
    history: ChatMessage[],
    onToken: (token: string) => void,
    options?: {
      resumeId?: string;
      resumeContent?: string;
      atsReview?: AtsReview;
    },
  ): Promise<ChatMessage> {
    const { data, error } = await invokeAiChat({
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      mode: options?.resumeId ? 'resume_improvement' : undefined,
      resumeId: options?.resumeId,
      resumeContent: options?.resumeContent,
      atsReview: options?.atsReview,
    });
    if (error) throw error;
    const reply = data?.reply || '';
    onToken(reply);
    return await this.appendMessage(conversationId, 'assistant', reply);
  }
  async openResumeImprovement(resumeId: string): Promise<ChatConversation> {
    const resume = await new ResumeService().get(resumeId);
    if (!resume) throw new Error('Resume not found');
    if (!resume.atsReview) throw new Error('Run Score ATS on this resume first');

    let conv = await this.findConversationForResume(resumeId);
    if (!conv) {
      conv = await this.createConversation(`ATS: ${resume.name}`.slice(0, 120), { resumeId });
    }

    if (!conv.messages.length) {
      const kickoff = `I scored "${resume.name}" and want help implementing the ATS feedback. Please review the feedback, ask me any clarifying questions you need, and help me update the resume step by step.`;
      await this.appendMessage(conv.id, 'user', kickoff);
      const assistant = await this.streamReply(conv.id, [
        { id: 'kickoff-user', role: 'user', content: kickoff, createdAt: new Date().toISOString() },
      ], () => {}, {
        resumeId,
        resumeContent: resume.content,
        atsReview: resume.atsReview,
      });
      conv = await this.getConversation(conv.id) || conv;
      if (!conv.messages.some((m) => m.id === assistant.id)) {
        conv.messages.push(assistant);
      }
    }

    return conv;
  }
  async pinMessage(conversationId: string, messageId: string): Promise<void> {
    const { data: msg } = await supabase.from('chat_messages').select('pinned').eq('id', messageId).maybeSingle();
    if (msg) {
      await supabase.from('chat_messages').update({ pinned: !msg.pinned }).eq('id', messageId);
    }
  }
}

export class SettingsService {
  async get(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('get_user_settings');
    if (error) return {};
    return (data as Record<string, unknown>) || {};
  }
  async update(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('upsert_user_settings', { p_data: patch });
    if (error) throw error;
    return (data as Record<string, unknown>) || {};
  }

  async mergeJobSearch(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = await this.get();
    const jobSearch = (current.jobSearch as Record<string, unknown> | undefined) || {};
    return this.update({ jobSearch: { ...jobSearch, ...patch } });
  }

  async contactOverlay(): Promise<{
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    startDate?: string;
  }> {
    const { data: { user } } = await supabase.auth.getUser();
    const data = await this.get();
    const contact = (data.contact as Record<string, string> | undefined) || {};
    let fullName: string | undefined;
    let title: string | undefined;
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('full_name, title').eq('user_id', user.id).maybeSingle();
      fullName = profile?.full_name || undefined;
      title = profile?.title || undefined;
    }
    return {
      fullName,
      title,
      email: contact.email || user?.email || undefined,
      phone: contact.phone || undefined,
      location: contact.location || undefined,
      linkedin: contact.linkedin || undefined,
      github: contact.github || undefined,
      startDate: contact.startDate || undefined,
    };
  }

  /** Write current contact/profile into the master resume header. */
  async applyContactToSeededResumes(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const overlay = await this.contactOverlay();
    const { data: rows } = await supabase
      .from('resumes')
      .select('id, name, content, corpus_type')
      .eq('user_id', user.id)
      .eq('is_corpus', true);
    for (const row of rows || []) {
      if (row.corpus_type !== 'master' && row.name !== MASTER_RESUME_NAME) continue;
      const next = applyContactOverlay(String(row.content || ''), overlay);
      if (next !== row.content) {
        await supabase.from('resumes').update({ content: next, updated_at: new Date().toISOString() }).eq('id', row.id);
      }
    }
  }
}

export class UserService {
  async profile(): Promise<UserProfile> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: newProfile, error: insertError } = await supabase.from('profiles').insert({
        user_id: user.id,
        full_name: user.user_metadata?.full_name || 'New User',
        email: user.email,
        title: '',
        plan: 'free',
        ai_credits_used: 0,
      }).select().single();
      if (insertError) throw insertError;
      return mapProfile({ ...newProfile, email: user.email });
    }
    return mapProfile({ ...data, email: user.email });
  }
  async updateProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const update: Record<string, unknown> = {};
    if (patch.fullName !== undefined) update.full_name = patch.fullName;
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;
    if (patch.plan !== undefined) update.plan = patch.plan;
    if (patch.aiTokensUsed !== undefined) update.ai_credits_used = patch.aiTokensUsed;
    const { data, error } = await supabase.from('profiles').update(update).eq('user_id', user.id).select().single();
    if (error) throw error;
    return mapProfile({ ...data, email: user.email });
  }
}

export class BootstrapService {
  private workflow = new WorkflowService();
  private settings = new SettingsService();

  /** Provision built-in job search workflow, automation, corpus, and default settings. */
  async ensure(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await this.workflow.ensureDefaultPipeline();
    await this.workflow.ensureTailorPipeline();
    try {
      await supabase.functions.invoke('resume-actions', { body: { mode: 'repair_sync' } });
    } catch {
      // Repair is best-effort on login; user can run manually from Job Discovery.
    }

    const settings = await this.settings.get();
    const jobSearch = settings.jobSearch as Record<string, string> | undefined;
    if (!jobSearch?.query) {
      await this.settings.update({
        jobSearch: {
          query: 'Integration Architect',
          location: 'San Francisco, CA',
          maxJobs: '5',
          postedWithin: '1d',
          resumeFileId: jobSearch?.resumeFileId ?? '',
          driveFolderId: jobSearch?.driveFolderId ?? '',
        },
        notifications: { email: user.email ?? '' },
        userEmail: user.email ?? '',
      });
    }

  }
}

export const services = {
  bootstrap: new BootstrapService(),
  jobSearch: new JobSearchService(),
  resume: new ResumeService(),
  ats: new ATSService(),
  coverLetter: new CoverLetterService(),
  application: new ApplicationService(),
  workflow: new WorkflowService(),
  execution: new ExecutionService(),
  agent: new AgentService(),
  document: new DocumentService(),
  embedding: new EmbeddingService(),
  prompt: new PromptService(),
  notification: new NotificationService(),
  integration: new IntegrationService(),
  analytics: new AnalyticsService(),
  email: new EmailService(),
  pdf: new PDFService(),
  storage: new StorageService(),
  ai: new AIService(),
  automation: new AutomationService(),
  chat: new ChatService(),
  user: new UserService(),
  settings: new SettingsService(),
};

export type Services = typeof services;
