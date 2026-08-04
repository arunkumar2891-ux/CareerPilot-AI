import type {
  Job, Resume, CoverLetter, Application, Workflow, Agent,
  Document, Notification, Integration, Prompt, Automation,
  ChatConversation, DashboardMetrics, AnalyticsPoint, UserProfile,
  JobSearchConfig, ChatMessage, AgentRun,
} from '@/types';
import {
  seedJobs, seedResumes, seedCoverLetters, seedApplications, seedWorkflows,
  seedAgents, seedDocuments, seedNotifications, seedIntegrations, seedPrompts,
  seedAutomations, seedConversations, seedDashboardMetrics, seedAnalytics,
  seedUserProfile,
} from '@/lib/seed';
import { uid, sleep } from '@/utils';

/**
 * Mock service layer. Each service mirrors a production API with async methods.
 * Swap implementations to call Supabase / edge functions without changing call sites.
 */

const lat = (ms = 200) => sleep(ms + Math.random() * 200);

export class JobSearchService {
  async list(_config?: Partial<JobSearchConfig>): Promise<Job[]> {
    await lat(250);
    return [...seedJobs];
  }
  async search(config: Partial<JobSearchConfig>): Promise<Job[]> {
    await lat(600);
    let results = [...seedJobs];
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
    if (config.remote) results = results.filter((j) => j.remote);
    if (config.hybrid) results = results.filter((j) => j.hybrid);
    if (config.salaryMin) results = results.filter((j) => (j.salaryMin || 0) >= config.salaryMin!);
    if (config.companies?.length) {
      results = results.filter((j) => config.companies!.some((c) => j.company.toLowerCase().includes(c.toLowerCase())));
    }
    return results.slice(0, config.maxJobs || 30);
  }
  async updateStatus(id: string, status: Job['status']): Promise<void> {
    await lat(150);
    const job = seedJobs.find((j) => j.id === id);
    if (job) job.status = status;
  }
}

export class ResumeService {
  async list(): Promise<Resume[]> {
    await lat();
    return [...seedResumes];
  }
  async get(id: string): Promise<Resume | undefined> {
    await lat();
    return seedResumes.find((r) => r.id === id);
  }
  async create(name: string, type: Resume['type'], content: string): Promise<Resume> {
    await lat(400);
    const resume: Resume = {
      id: uid('res'), name, type, content, atsScore: 0, versions: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    seedResumes.unshift(resume);
    return resume;
  }
  async update(id: string, content: string): Promise<void> {
    await lat(200);
    const r = seedResumes.find((x) => x.id === id);
    if (r) { r.content = content; r.updatedAt = new Date().toISOString(); }
  }
  async generateTailored(jobId: string, resumeId: string, style: 'technical' | 'executive' | 'general'): Promise<Resume> {
    await lat(1200);
    const base = seedResumes.find((r) => r.id === resumeId);
    const job = seedJobs.find((j) => j.id === jobId);
    const name = `${style.charAt(0).toUpperCase() + style.slice(1)} — ${job?.company || 'New'} Resume`;
    const content = `# ${name}\n\nTailored for ${job?.role} at ${job?.company}.\n\n${base?.content || ''}`;
    const resume: Resume = {
      id: uid('res'), name, type: style, content, atsScore: 88 + Math.floor(Math.random() * 10),
      versions: [{ id: uid('rv'), resumeId: '', version: 1, content, atsScore: 88, createdAt: new Date().toISOString(), note: 'AI generated' }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    seedResumes.unshift(resume);
    return resume;
  }
  async compare(idA: string, idB: string): Promise<{ a: Resume; b: Resume; diff: string[] }> {
    await lat(300);
    const a = seedResumes.find((r) => r.id === idA)!;
    const b = seedResumes.find((r) => r.id === idB)!;
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
  async score(content: string): Promise<{ score: number; feedback: string[] }> {
    await lat(800);
    const score = 70 + Math.floor(Math.random() * 28);
    const feedback = [
      'Keywords matched well for target role',
      'Consider quantifying more achievements',
      'Contact section is complete',
      'Skills section aligns with common ATS parsing',
    ];
    return { score, feedback };
  }
}

export class CoverLetterService {
  async list(): Promise<CoverLetter[]> {
    await lat();
    return [...seedCoverLetters];
  }
  async create(name: string, companyName: string, role: string, content: string): Promise<CoverLetter> {
    await lat(400);
    const cl: CoverLetter = {
      id: uid('cl'), name, companyName, role, content,
      versions: [{ id: uid('clv'), version: 1, content, createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    seedCoverLetters.unshift(cl);
    return cl;
  }
  async generate(jobId: string): Promise<CoverLetter> {
    await lat(1000);
    const job = seedJobs.find((j) => j.id === jobId);
    const content = `Dear Hiring Manager,\n\nI'm excited to apply for the ${job?.role} position at ${job?.company}. My experience aligns strongly with your requirements...\n\nBest regards,\nAlex Morgan`;
    return this.create(`Cover Letter — ${job?.company}`, job?.company || '', job?.role || '', content);
  }
  async update(id: string, content: string): Promise<void> {
    await lat(200);
    const cl = seedCoverLetters.find((c) => c.id === id);
    if (cl) { cl.content = content; cl.updatedAt = new Date().toISOString(); }
  }
}

export class ApplicationService {
  async list(): Promise<Application[]> {
    await lat();
    return [...seedApplications];
  }
  async create(app: Partial<Application>): Promise<Application> {
    await lat(300);
    const newApp: Application = {
      id: uid('app'),
      company: app.company || '',
      role: app.role || '',
      applicationDate: new Date().toISOString(),
      status: 'draft',
      timeline: [{ id: uid('ev'), type: 'submitted', label: 'Application Created', date: new Date().toISOString() }],
      notes: '', attachments: [],
      createdAt: new Date().toISOString(),
      ...app,
    };
    seedApplications.unshift(newApp);
    return newApp;
  }
  async updateStatus(id: string, status: Application['status']): Promise<void> {
    await lat(150);
    const app = seedApplications.find((a) => a.id === id);
    if (app) {
      app.status = status;
      app.timeline.push({ id: uid('ev'), type: status as Application['timeline'][number]['type'], label: status.charAt(0).toUpperCase() + status.slice(1), date: new Date().toISOString() });
    }
  }
}

export class WorkflowService {
  async list(): Promise<Workflow[]> {
    await lat();
    return [...seedWorkflows];
  }
  async get(id: string): Promise<Workflow | undefined> {
    await lat();
    return seedWorkflows.find((w) => w.id === id);
  }
  async create(name: string, description: string): Promise<Workflow> {
    await lat(300);
    const wf: Workflow = {
      id: uid('wf'), name, description, active: false, nodes: [], edges: [],
      runs: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    seedWorkflows.unshift(wf);
    return wf;
  }
  async update(id: string, patch: Partial<Workflow>): Promise<void> {
    await lat(200);
    const wf = seedWorkflows.find((w) => w.id === id);
    if (wf) Object.assign(wf, patch, { updatedAt: new Date().toISOString() });
  }
  async toggle(id: string): Promise<void> {
    await lat(150);
    const wf = seedWorkflows.find((w) => w.id === id);
    if (wf) wf.active = !wf.active;
  }
  async delete(id: string): Promise<void> {
    await lat(150);
    const idx = seedWorkflows.findIndex((w) => w.id === id);
    if (idx >= 0) seedWorkflows.splice(idx, 1);
  }
}

export class ExecutionService {
  async listRuns(): Promise<Workflow['runs']> {
    await lat();
    return seedWorkflows.flatMap((w) => w.runs.map((r) => ({ ...r, workflowId: w.id, workflowName: w.name } as Workflow['runs'][number] & { workflowName: string })));
  }
  async runWorkflow(id: string): Promise<Workflow['runs'][number]> {
    const wf = seedWorkflows.find((w) => w.id === id);
    if (!wf) throw new Error('Workflow not found');
    const run: Workflow['runs'][number] = {
      id: uid('run'), workflowId: id, status: 'running', startedAt: new Date().toISOString(),
      duration: 0, nodeResults: wf.nodes.map((n) => ({ nodeId: n.id, status: 'idle', duration: 0 })), logs: [],
    };
    wf.runs.unshift(run);
    for (const n of wf.nodes) {
      await sleep(300 + Math.random() * 400);
      const nr = run.nodeResults.find((x) => x.nodeId === n.id);
      if (nr) { nr.status = 'success'; nr.duration = 300 + Math.floor(Math.random() * 400); }
      run.logs.push({ id: uid('log'), level: 'info', message: `Node ${n.name} executed`, timestamp: new Date().toISOString(), nodeId: n.id });
    }
    run.status = 'success';
    run.finishedAt = new Date().toISOString();
    run.duration = Date.now() - new Date(run.startedAt).getTime();
    return run;
  }
}

export class AgentService {
  async list(): Promise<Agent[]> {
    await lat();
    return [...seedAgents];
  }
  async get(id: string): Promise<Agent | undefined> {
    await lat();
    return seedAgents.find((a) => a.id === id);
  }
  async update(id: string, patch: Partial<Agent>): Promise<void> {
    await lat(200);
    const a = seedAgents.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  }
  async run(id: string, input: string): Promise<AgentRun> {
    const agent = seedAgents.find((a) => a.id === id);
    if (!agent) throw new Error('Agent not found');
    await lat(1500);
    const run: AgentRun = {
      id: uid('arun'), agentId: id, status: 'success', input,
      output: `[${agent.name}] Processed your request and generated a tailored response based on the configured prompt and ${agent.model} model.`,
      startedAt: new Date().toISOString(), duration: 1500, cost: 0.01 + Math.random() * 0.04, tokens: 800 + Math.floor(Math.random() * 2000),
    };
    agent.runs.unshift(run);
    agent.metrics.runs += 1;
    return run;
  }
}

export class DocumentService {
  async list(): Promise<Document[]> {
    await lat();
    return [...seedDocuments];
  }
  async create(name: string, type: Document['type'], size: number, folder: string): Promise<Document> {
    await lat(300);
    const doc: Document = {
      id: uid('doc'), name, type, size, folder, tags: [],
      versions: [{ id: uid('dv'), version: 1, createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    seedDocuments.unshift(doc);
    return doc;
  }
  async delete(id: string): Promise<void> {
    await lat(150);
    const idx = seedDocuments.findIndex((d) => d.id === id);
    if (idx >= 0) seedDocuments.splice(idx, 1);
  }
}

export class EmbeddingService {
  async embed(text: string): Promise<number[]> {
    await lat(500);
    return Array.from({ length: 384 }, () => Math.random() * 2 - 1);
  }
  async search(query: string, _collection?: string): Promise<{ chunk: string; score: number }[]> {
    await lat(400);
    return [
      { chunk: 'Resume highlights: led migration to microservices...', score: 0.92 },
      { chunk: 'Built design system adopted across 12 teams...', score: 0.87 },
      { chunk: 'Experience with React, TypeScript, Node.js...', score: 0.84 },
    ];
  }
}

export class PromptService {
  async list(): Promise<Prompt[]> {
    await lat();
    return [...seedPrompts];
  }
  async create(name: string, category: string, content: string, variables: string[]): Promise<Prompt> {
    await lat(300);
    const p: Prompt = {
      id: uid('pmt'), name, category, content, variables, version: 1,
      history: [{ id: uid('ph'), version: 1, content, createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
    };
    seedPrompts.unshift(p);
    return p;
  }
  async update(id: string, content: string): Promise<void> {
    await lat(200);
    const p = seedPrompts.find((x) => x.id === id);
    if (p) {
      p.version += 1;
      p.content = content;
      p.history.unshift({ id: uid('ph'), version: p.version, content, createdAt: new Date().toISOString() });
    }
  }
  async test(_content: string, _variables: Record<string, string>): Promise<string> {
    await lat(800);
    return 'Test output: The prompt executed successfully with the provided variables. Generated a 3-paragraph tailored response.';
  }
}

export class NotificationService {
  async list(): Promise<Notification[]> {
    await lat();
    return [...seedNotifications];
  }
  async markRead(id: string): Promise<void> {
    await lat(100);
    const n = seedNotifications.find((x) => x.id === id);
    if (n) n.read = true;
  }
  async markAllRead(): Promise<void> {
    await lat(150);
    seedNotifications.forEach((n) => (n.read = true));
  }
}

export class IntegrationService {
  async list(): Promise<Integration[]> {
    await lat();
    return [...seedIntegrations];
  }
  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    await lat(800);
    const int = seedIntegrations.find((i) => i.id === id);
    if (int) {
      int.status = 'connected';
      int.lastSync = new Date().toISOString();
    }
    return { success: true, message: 'Connection test successful' };
  }
  async toggle(id: string): Promise<void> {
    await lat(200);
    const int = seedIntegrations.find((i) => i.id === id);
    if (int) int.status = int.status === 'connected' ? 'disconnected' : 'connected';
  }
}

export class AnalyticsService {
  async metrics(): Promise<DashboardMetrics> {
    await lat();
    return { ...seedDashboardMetrics };
  }
  async timeseries(): Promise<AnalyticsPoint[]> {
    await lat();
    return [...seedAnalytics];
  }
  async summary(): Promise<{
    jobsFound: number; jobsApplied: number; interviewRate: number;
    offerRate: number; aiUsage: number; tokenUsage: number; cost: number;
  }> {
    await lat();
    return {
      jobsFound: 247, jobsApplied: 34, interviewRate: 32, offerRate: 12,
      aiUsage: 1240, tokenUsage: 480000, cost: 24.5,
    };
  }
}

export class EmailService {
  async send(to: string, subject: string, body: string): Promise<{ success: boolean }> {
    await lat(500);
    return { success: true };
  }
}

export class PDFService {
  async generate(_content: string, _title: string): Promise<{ url: string }> {
    await lat(700);
    return { url: 'data:application/pdf;base64,JVBERi0xLjQK' };
  }
}

export class StorageService {
  async upload(_file: File, _path: string): Promise<{ url: string }> {
    await lat(600);
    return { url: `https://storage.example.com/${_path}/${_file.name}` };
  }
}

// AI Provider abstraction
export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
  stream(messages: ChatMessage[], onToken: (t: string) => void): Promise<string>;
  embed(text: string): Promise<number[]>;
}

class MockProvider implements AIProvider {
  constructor(public name: string) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    await lat(800);
    const last = messages[messages.length - 1];
    return `Here's my response to "${last?.content.slice(0, 60)}..." using ${this.name}. I've analyzed your request and prepared a comprehensive, tailored response with actionable recommendations.`;
  }
  async stream(messages: ChatMessage[], onToken: (t: string) => void): Promise<string> {
    const response = await this.chat(messages);
    const tokens = response.split(' ');
    let acc = '';
    for (const t of tokens) {
      await sleep(30);
      acc += t + ' ';
      onToken(acc);
    }
    return response;
  }
  async embed(text: string): Promise<number[]> {
    return new EmbeddingService().embed(text);
  }
}

export class AIService {
  private providers: Record<string, AIProvider> = {};
  constructor() {
    (['gemini', 'openai', 'claude', 'azure', 'ollama', 'bedrock'] as const).forEach((p) => {
      this.providers[p] = new MockProvider(p);
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
    await lat();
    return [...seedAutomations];
  }
  async toggle(id: string): Promise<void> {
    await lat(150);
    const a = seedAutomations.find((x) => x.id === id);
    if (a) a.status = a.status === 'active' ? 'paused' : 'active';
  }
  async clone(id: string): Promise<Automation> {
    await lat(250);
    const src = seedAutomations.find((a) => a.id === id)!;
    const clone: Automation = { ...src, id: uid('auto'), name: `${src.name} (Copy)`, status: 'paused', createdAt: new Date().toISOString() };
    seedAutomations.unshift(clone);
    return clone;
  }
}

export class ChatService {
  async listConversations(): Promise<ChatConversation[]> {
    await lat();
    return [...seedConversations];
  }
  async createConversation(title: string): Promise<ChatConversation> {
    await lat(200);
    const c: ChatConversation = {
      id: uid('chat'), title, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    seedConversations.unshift(c);
    return c;
  }
  async sendMessage(conversationId: string, content: string): Promise<ChatMessage> {
    await lat(1000);
    const conv = seedConversations.find((c) => c.id === conversationId);
    const userMsg: ChatMessage = { id: uid('msg'), role: 'user', content, createdAt: new Date().toISOString() };
    const assistantMsg: ChatMessage = {
      id: uid('msg'), role: 'assistant',
      content: `I've processed your request: "${content.slice(0, 80)}". Here's a comprehensive response with tailored recommendations and next steps based on your career profile.`,
      createdAt: new Date().toISOString(),
    };
    if (conv) {
      conv.messages.push(userMsg, assistantMsg);
      conv.updatedAt = new Date().toISOString();
    }
    return assistantMsg;
  }
  async pinMessage(conversationId: string, messageId: string): Promise<void> {
    await lat(100);
    const conv = seedConversations.find((c) => c.id === conversationId);
    const msg = conv?.messages.find((m) => m.id === messageId);
    if (msg) msg.pinned = !msg.pinned;
  }
}

export class UserService {
  async profile(): Promise<UserProfile> {
    await lat();
    return { ...seedUserProfile };
  }
  async updateProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
    await lat(200);
    Object.assign(seedUserProfile, patch);
    return { ...seedUserProfile };
  }
}

// Dependency injection container
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
