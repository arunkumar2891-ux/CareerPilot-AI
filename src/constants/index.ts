import {
  Briefcase,
  FileText,
  Mail,
  Sparkles,
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
  { label: 'Knowledge Base', path: '/knowledge', icon: FolderOpen, group: 'Resources' },
  { label: 'Execution History', path: '/executions', icon: History, group: 'Resources' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, group: 'Resources' },
  { label: 'Integrations', path: '/integrations', icon: Plug, group: 'Configure' },
  { label: 'Setup Guide', path: '/setup', icon: ListChecks, group: 'Configure' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Configure' },
];

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
