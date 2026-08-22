import {
  Briefcase,
  FileText,
  Mail,
  Sparkles,
  Workflow,
  Bot,
  FolderOpen,
  BarChart3,
  History,
  Plug,
  Settings,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: string;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Overview' },
  { label: 'Job Discovery', path: '/jobs', icon: Briefcase, group: 'Overview' },
  { label: 'Applications', path: '/applications', icon: FileText, group: 'Overview' },
  { label: 'Resumes', path: '/resumes', icon: FileText, group: 'Studio' },
  { label: 'Cover Letters', path: '/cover-letters', icon: Mail, group: 'Studio' },
  { label: 'AI Copilot', path: '/copilot', icon: Sparkles, group: 'Studio' },
  { label: 'Automations', path: '/automations', icon: Workflow, group: 'Automate' },
  { label: 'Workflow Studio', path: '/workflows', icon: Workflow, group: 'Automate' },
  { label: 'AI Agents', path: '/agents', icon: Bot, group: 'Automate' },
  { label: 'Documents', path: '/documents', icon: FolderOpen, group: 'Resources' },
  { label: 'Knowledge Base', path: '/knowledge', icon: FolderOpen, group: 'Resources' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, group: 'Insights' },
  { label: 'Execution History', path: '/executions', icon: History, group: 'Insights' },
  { label: 'Integrations', path: '/integrations', icon: Plug, group: 'Configure' },
  { label: 'Setup Guide', path: '/setup', icon: ListChecks, group: 'Configure', badge: 'Start' },
  { label: 'Prompt Library', path: '/prompts', icon: FileText, group: 'Configure' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Configure' },
];

export const AI_PROVIDERS = [
  { id: 'gemini', name: 'Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { id: 'claude', name: 'Claude', models: ['claude-3.5-sonnet', 'claude-3-opus', 'claude-3-haiku'] },
  { id: 'azure', name: 'Azure OpenAI', models: ['gpt-4o', 'gpt-35-turbo'] },
  { id: 'ollama', name: 'Ollama', models: ['llama3', 'mistral', 'phi3'] },
  { id: 'bedrock', name: 'Bedrock', models: ['anthropic.claude-3', 'amazon.titan'] },
] as const;

export const WORKFLOW_NODE_TYPES = [
  'schedule', 'http', 'webhook', 'gdrive', 'gdocs', 'apify', 'linkedin',
  'gemini', 'openai', 'claude', 'supabase', 'condition', 'loop', 'switch',
  'merge', 'wait', 'resume_optimizer', 'cover_letter', 'email', 'notification',
  'storage', 'pdf', 'job_search', 'duplicate_checker', 'prompt', 'function',
  'transform', 'trigger',
] as const;

export const NODE_CATEGORIES = [
  { name: 'Triggers', nodes: ['schedule', 'webhook', 'trigger'] },
  { name: 'AI', nodes: ['gemini', 'openai', 'claude', 'resume_optimizer', 'cover_letter', 'prompt'] },
  { name: 'Integrations', nodes: ['http', 'gdrive', 'gdocs', 'apify', 'linkedin', 'supabase', 'email', 'notification', 'storage', 'pdf'] },
  { name: 'Logic', nodes: ['condition', 'loop', 'switch', 'merge', 'wait'] },
  { name: 'Data', nodes: ['job_search', 'duplicate_checker', 'function', 'transform'] },
] as const;

export const JOB_BOARDS = ['LinkedIn', 'Indeed', 'Glassdoor', 'AngelList', 'Wellfound', 'ZipRecruiter', 'Dice', 'Remotive'];
export const EXPERIENCE_LEVELS = ['Entry', 'Junior', 'Mid', 'Senior', 'Lead', 'Staff', 'Principal', 'Executive'];
export const APPLICATION_STATUSES = ['draft', 'submitted', 'viewed', 'interview', 'offer', 'rejected', 'withdrawn'];
export const JOB_STATUSES = ['discovered', 'queued', 'resume_ready', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-primary/15 text-primary',
  viewed: 'bg-chart-4/15 text-chart-4',
  interview: 'bg-warning/15 text-warning',
  offer: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  withdrawn: 'bg-muted text-muted-foreground',
  discovered: 'bg-primary/15 text-primary',
  queued: 'bg-chart-4/15 text-chart-4',
  resume_ready: 'bg-warning/15 text-warning',
  applied: 'bg-chart-2/15 text-chart-2',
  running: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  failed: 'bg-destructive/15 text-destructive',
  paused: 'bg-muted text-muted-foreground',
  idle: 'bg-muted text-muted-foreground',
  active: 'bg-success/15 text-success',
  error: 'bg-destructive/15 text-destructive',
  connected: 'bg-success/15 text-success',
  disconnected: 'bg-muted text-muted-foreground',
  pending: 'bg-warning/15 text-warning',
};
