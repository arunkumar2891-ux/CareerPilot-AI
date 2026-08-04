import type {
  Job, Resume, CoverLetter, Application, Workflow, Agent,
  Document, Notification, Integration, Prompt, Automation,
  ChatConversation, DashboardMetrics, AnalyticsPoint, UserProfile,
  JobSearchConfig, ChatMessage, AgentRun,
} from '@/types';
import { supabase } from '@/lib/supabase';
import { uid, sleep } from '@/utils';

/* ── helpers ── */

function mapJob(row: Record<string, unknown>): Job {
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
    status: (row.status as Job['status']) ?? 'discovered',
    url: row.url as string | undefined,
    createdAt: row.created_at as string,
  };
}

function mapResume(row: Record<string, unknown>): Resume {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: (row.type as Resume['type']) ?? 'general',
    content: String(row.content ?? ''),
    atsScore: Number(row.ats_score ?? 0),
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
    attachments: (row.attachments as string[]) ?? [],
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

function mapConversation(row: Record<string, unknown>): ChatConversation {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    messages: (row.chat_messages as Record<string, unknown>[])?.map((m) => ({
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
    aiCreditsUsed: Number(row.ai_credits_used ?? 0),
    aiCreditsTotal: Number(row.ai_credits_total ?? 0),
  };
}

/* ── services ── */

export class JobSearchService {
  async list(_config?: Partial<JobSearchConfig>): Promise<Job[]> {
    const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapJob);
  }
  async search(config: Partial<JobSearchConfig>): Promise<Job[]> {
    let q = supabase.from('jobs').select('*');
    if (config.remote) q = q.eq('remote', true);
    if (config.hybrid) q = q.eq('hybrid', true);
    if (config.salaryMin) q = q.gte('salary_min', config.salaryMin);
    const { data, error } = await q.order('match_score', { ascending: false }).limit(config.maxJobs || 30);
    if (error) throw error;
    let results = (data || []).map(mapJob);
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
}

export class ResumeService {
  async list(): Promise<Resume[]> {
    const { data, error } = await supabase.from('resumes').select('*, resume_versions(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapResume);
  }
  async get(id: string): Promise<Resume | undefined> {
    const { data, error } = await supabase.from('resumes').select('*, resume_versions(*)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapResume(data) : undefined;
  }
  async create(name: string, type: Resume['type'], content: string): Promise<Resume> {
    const { data, error } = await supabase.from('resumes').insert({ name, type, content, ats_score: 0 }).select('*, resume_versions(*)').single();
    if (error) throw error;
    return mapResume(data);
  }
  async update(id: string, content: string): Promise<void> {
    const { error } = await supabase.from('resumes').update({ content, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }
  async generateTailored(_jobId: string, _resumeId: string, _style: 'technical' | 'executive' | 'general'): Promise<Resume> {
    await sleep(1200);
    throw new Error('AI resume generation requires an AI provider API key');
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
}

export class ATSService {
  async score(_content: string): Promise<{ score: number; feedback: string[] }> {
    await sleep(800);
    throw new Error('ATS scoring requires an AI provider API key');
  }
}

export class CoverLetterService {
  async list(): Promise<CoverLetter[]> {
    const { data, error } = await supabase.from('cover_letters').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapCoverLetter);
  }
  async create(name: string, companyName: string, role: string, content: string): Promise<CoverLetter> {
    const { data, error } = await supabase.from('cover_letters').insert({ name, company_name: companyName, role, content }).select().single();
    if (error) throw error;
    return mapCoverLetter(data);
  }
  async generate(_jobId: string): Promise<CoverLetter> {
    await sleep(1000);
    throw new Error('AI cover letter generation requires an AI provider API key');
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
    const { data, error } = await supabase.from('applications').insert({
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
    await supabase.from('application_events').insert({
      application_id: id,
      type: status,
      label: status.charAt(0).toUpperCase() + status.slice(1),
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
    const { data, error } = await supabase.from('workflows').insert({ name, description, active: false }).select('*, workflow_nodes(*), workflow_edges(*)').single();
    if (error) throw error;
    return mapWorkflow(data);
  }
  async update(id: string, patch: Partial<Workflow>): Promise<void> {
    const { error } = await supabase.from('workflows').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
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

export class ExecutionService {
  async listRuns(): Promise<Workflow['runs']> {
    const { data, error } = await supabase
      .from('workflow_runs')
      .select('*, workflow:workflows(name), workflow_run_nodes(*), workflow_logs(*)')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data || []).map((r) => ({
      id: String(r.id),
      workflowId: String(r.workflow_id),
      status: (r.status as Workflow['runs'][number]['status']) ?? 'success',
      startedAt: (r.started_at as string) ?? '',
      finishedAt: r.finished_at as string | undefined,
      duration: Number(r.duration_ms ?? 0),
      nodeResults: ((r.workflow_run_nodes as Record<string, unknown>[]) ?? []).map((n) => ({
        nodeId: String(n.node_id ?? ''),
        status: (n.status as Workflow['runs'][number]['nodeResults'][number]['status']) ?? 'success',
        duration: Number(n.duration_ms ?? 0),
        output: n.output as string | undefined,
      })),
      logs: ((r.workflow_logs as Record<string, unknown>[]) ?? []).map((l) => ({
        id: String(l.id),
        level: (l.level as 'info' | 'warn' | 'error' | 'debug') ?? 'info',
        message: String(l.message ?? ''),
        timestamp: (l.timestamp as string) ?? '',
        nodeId: l.node_id as string | undefined,
      })),
      workflowName: (r.workflow as Record<string, unknown>)?.name as string | undefined,
    })) as unknown as Workflow['runs'];
  }
  async runWorkflow(_id: string): Promise<Workflow['runs'][number]> {
    throw new Error('Workflow execution requires a backend runner');
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
  async run(_id: string, _input: string): Promise<AgentRun> {
    throw new Error('Agent execution requires an AI provider API key');
  }
}

export class DocumentService {
  async list(): Promise<Document[]> {
    const { data, error } = await supabase.from('documents').select('*, document_versions(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDocument);
  }
  async create(name: string, type: Document['type'], size: number, folder: string): Promise<Document> {
    const { data, error } = await supabase.from('documents').insert({ name, type, size, folder, tags: [] }).select('*, document_versions(*)').single();
    if (error) throw error;
    return mapDocument(data);
  }
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) throw error;
  }
}

export class EmbeddingService {
  async embed(_text: string): Promise<number[]> {
    throw new Error('Embeddings require an AI provider API key');
  }
  async search(_query: string, _collection?: string): Promise<{ chunk: string; score: number }[]> {
    throw new Error('Semantic search requires an AI provider API key');
  }
}

export class PromptService {
  async list(): Promise<Prompt[]> {
    const { data, error } = await supabase.from('prompts').select('*, prompt_versions(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapPrompt);
  }
  async create(name: string, category: string, content: string, variables: string[]): Promise<Prompt> {
    const { data, error } = await supabase.from('prompts').insert({ name, category, content, variables, version: 1 }).select('*, prompt_versions(*)').single();
    if (error) throw error;
    return mapPrompt(data);
  }
  async update(id: string, content: string): Promise<void> {
    const { data: current } = await supabase.from('prompts').select('version').eq('id', id).maybeSingle();
    const nextVersion = (current?.version ?? 0) + 1;
    const { error } = await supabase.from('prompts').update({ content, version: nextVersion, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await supabase.from('prompt_versions').insert({ prompt_id: id, version: nextVersion, content });
  }
  async test(_content: string, _variables: Record<string, string>): Promise<string> {
    throw new Error('Prompt testing requires an AI provider API key');
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
    const { data, error } = await supabase.from('integrations').select('*, integration_logs(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapIntegration);
  }
  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    const { error } = await supabase.from('integrations').update({ status: 'connected', last_sync: new Date().toISOString() }).eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'Connection test successful' };
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
  async metrics(): Promise<DashboardMetrics> {
    const [jobsRes, appsRes, resumesRes] = await Promise.all([
      supabase.from('jobs').select('*'),
      supabase.from('applications').select('*'),
      supabase.from('resume_versions').select('*'),
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
      aiCreditsUsed: 0,
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
      aiUsage: m.aiCreditsUsed,
      tokenUsage: 0,
      cost: 0,
    };
  }
}

export class EmailService {
  async send(_to: string, _subject: string, _body: string): Promise<{ success: boolean }> {
    throw new Error('Email sending requires an SMTP integration');
  }
}

export class PDFService {
  async generate(_content: string, _title: string): Promise<{ url: string }> {
    throw new Error('PDF generation requires a backend service');
  }
}

export class StorageService {
  async upload(_file: File, _path: string): Promise<{ url: string }> {
    throw new Error('File upload requires storage configuration');
  }
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
  stream(messages: ChatMessage[], onToken: (t: string) => void): Promise<string>;
  embed(text: string): Promise<number[]>;
}

class UnconfiguredProvider implements AIProvider {
  constructor(public name: string) {}
  async chat(_messages: ChatMessage[]): Promise<string> {
    throw new Error(`${this.name} AI provider is not configured. Add an API key in Settings.`);
  }
  async stream(_messages: ChatMessage[], _onToken: (t: string) => void): Promise<string> {
    throw new Error(`${this.name} AI provider is not configured. Add an API key in Settings.`);
  }
  async embed(_text: string): Promise<number[]> {
    throw new Error(`${this.name} AI provider is not configured. Add an API key in Settings.`);
  }
}

export class AIService {
  private providers: Record<string, AIProvider> = {};
  constructor() {
    (['gemini', 'openai', 'claude', 'azure', 'ollama', 'bedrock'] as const).forEach((p) => {
      this.providers[p] = new UnconfiguredProvider(p);
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
    const { data, error } = await supabase.from('automations').insert({
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
  async createConversation(title: string): Promise<ChatConversation> {
    const { data, error } = await supabase.from('chat_conversations').insert({ title }).select('*, chat_messages(*)').single();
    if (error) throw error;
    return mapConversation(data);
  }
  async sendMessage(conversationId: string, content: string): Promise<ChatMessage> {
    await supabase.from('chat_messages').insert({ conversation_id: conversationId, role: 'user', content });
    throw new Error('AI chat requires an AI provider API key. Add one in Settings.');
  }
  async pinMessage(conversationId: string, messageId: string): Promise<void> {
    const { data: msg } = await supabase.from('chat_messages').select('pinned').eq('id', messageId).maybeSingle();
    if (msg) {
      await supabase.from('chat_messages').update({ pinned: !msg.pinned }).eq('id', messageId);
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
        ai_credits_total: 1000,
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
    if (patch.aiCreditsUsed !== undefined) update.ai_credits_used = patch.aiCreditsUsed;
    if (patch.aiCreditsTotal !== undefined) update.ai_credits_total = patch.aiCreditsTotal;
    const { data, error } = await supabase.from('profiles').update(update).eq('user_id', user.id).select().single();
    if (error) throw error;
    return mapProfile({ ...data, email: user.email });
  }
}

export const services = {
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
};

export type Services = typeof services;
