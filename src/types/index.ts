export type JobStatus =
  | 'discovered'
  | 'queued'
  | 'resume_ready'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'viewed'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type WorkflowRunStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'paused'
  | 'queued';

export type AgentRunStatus = 'idle' | 'running' | 'success' | 'failed';

export type AIProvider = 'gemini' | 'openai' | 'claude' | 'azure' | 'ollama' | 'bedrock';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export type NotificationType =
  | 'email'
  | 'push'
  | 'in_app'
  | 'slack'
  | 'reminder'
  | 'failure'
  | 'summary';

export interface Job {
  id: string;
  company: string;
  role: string;
  description: string;
  matchScore: number;
  salaryMin?: number;
  salaryMax?: number;
  skills: string[];
  postingDate: string;
  source: string;
  location: string;
  remote: boolean;
  hybrid: boolean;
  experience?: string;
  duplicate: boolean;
  resumeStatus: 'none' | 'generating' | 'ready';
  applicationStatus: ApplicationStatus;
  status: JobStatus;
  url?: string;
  createdAt: string;
}

export interface Resume {
  id: string;
  name: string;
  type: 'technical' | 'executive' | 'creative' | 'general';
  content: string;
  atsScore: number;
  versions: ResumeVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  version: number;
  content: string;
  atsScore: number;
  createdAt: string;
  note?: string;
}

export interface CoverLetter {
  id: string;
  name: string;
  jobId?: string;
  companyName?: string;
  role?: string;
  content: string;
  versions: { id: string; version: number; content: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Application {
  id: string;
  jobId?: string;
  company: string;
  role: string;
  resumeVersionId?: string;
  coverLetterId?: string;
  applicationDate: string;
  recruiter?: string;
  status: ApplicationStatus;
  timeline: ApplicationEvent[];
  notes: string;
  attachments: string[];
  createdAt: string;
}

export interface ApplicationEvent {
  id: string;
  type: 'submitted' | 'viewed' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'note';
  label: string;
  date: string;
  description?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  active: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  schedule?: string;
  lastRun?: string;
  nextRun?: string;
  runs: WorkflowRun[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  status?: WorkflowRunStatus;
}

export type WorkflowNodeType =
  | 'schedule'
  | 'http'
  | 'webhook'
  | 'gdrive'
  | 'gdocs'
  | 'apify'
  | 'linkedin'
  | 'gemini'
  | 'openai'
  | 'claude'
  | 'supabase'
  | 'condition'
  | 'loop'
  | 'switch'
  | 'merge'
  | 'wait'
  | 'resume_optimizer'
  | 'cover_letter'
  | 'email'
  | 'notification'
  | 'storage'
  | 'pdf'
  | 'job_search'
  | 'duplicate_checker'
  | 'prompt'
  | 'function'
  | 'transform'
  | 'trigger';

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: WorkflowRunStatus;
  startedAt: string;
  finishedAt?: string;
  duration: number;
  currentNodeId?: string;
  errorMessage?: string;
  batchProgress?: { node: string; index: number; total: number };
  nodeResults: { nodeId: string; status: WorkflowRunStatus; duration: number; output?: string }[];
  logs: ExecutionLog[];
}

export interface ExecutionLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  nodeId?: string;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  description: string;
  prompt: string;
  model: AIProvider;
  temperature: number;
  memory: boolean;
  enabled: boolean;
  runs: AgentRun[];
  metrics: { runs: number; successRate: number; avgLatency: number; totalCost: number; tokens: number };
  createdAt: string;
}

export type AgentType =
  | 'resume_optimizer'
  | 'ats_analyzer'
  | 'job_matcher'
  | 'job_ranker'
  | 'resume_formatter'
  | 'cover_letter_writer'
  | 'interview_coach'
  | 'career_advisor'
  | 'application_reviewer'
  | 'email_composer';

export interface AgentRun {
  id: string;
  agentId: string;
  status: AgentRunStatus;
  input: string;
  output: string;
  startedAt: string;
  duration: number;
  cost: number;
  tokens: number;
}

export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt' | 'md' | 'image';
  size: number;
  folder: string;
  tags: string[];
  content?: string;
  versions: { id: string; version: number; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  collection: string;
  metadata: Record<string, unknown>;
}

export interface Prompt {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
  version: number;
  history: { id: string; version: number; content: string; createdAt: string }[];
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Integration {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  description: string;
  icon: string;
  lastSync?: string;
  logs: { id: string; message: string; level: 'info' | 'error'; timestamp: string }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  artifact?: { type: 'resume' | 'cover_letter' | 'analysis'; title: string; content: string };
  createdAt: string;
  pinned?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Automation {
  id: string;
  name: string;
  workflowId: string;
  status: 'active' | 'paused' | 'error';
  schedule: string;
  trigger: string;
  lastRun?: string;
  nextRun?: string;
  retries: number;
  versions: { id: string; version: number; createdAt: string }[];
  createdAt: string;
}

export interface JobSearchConfig {
  keywords: string[];
  locations: string[];
  remote: boolean;
  hybrid: boolean;
  experience: string;
  salaryMin?: number;
  salaryMax?: number;
  companies: string[];
  dateFilter: string;
  jobBoards: string[];
  maxJobs: number;
  frequency: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  title: string;
  avatarUrl?: string;
  plan: 'free' | 'pro' | 'enterprise';
  aiCreditsUsed: number;
  aiCreditsTotal: number;
}

export interface DashboardMetrics {
  jobsFoundToday: number;
  jobsProcessed: number;
  applicationsReady: number;
  applicationsSubmitted: number;
  resumeVersions: number;
  aiCreditsUsed: number;
  successRate: number;
  avgAtsScore: number;
}

export interface AnalyticsPoint {
  label: string;
  jobsFound: number;
  jobsApplied: number;
  interviewRate: number;
  offerRate: number;
}
