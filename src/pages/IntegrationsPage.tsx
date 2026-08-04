import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Plug, CheckCircle2, XCircle, RefreshCw, Settings, PlugZap, Plus,
  Linkedin, FileText, Mail, Github, Slack, Chrome, Database, Webhook,
  Cloud, Calendar, MessageSquare, type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { services } from '@/services';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/utils';
import { toast } from 'sonner';
import type { Integration } from '@/types';

interface CatalogEntry {
  name: string;
  category: string;
  description: string;
  icon: LucideIcon;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

const CATALOG: CatalogEntry[] = [
  {
    name: 'LinkedIn',
    category: 'Job Boards',
    description: 'Scrape LinkedIn job postings and auto-apply with your profile.',
    icon: Linkedin,
    fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'li_...', type: 'password' }],
  },
  {
    name: 'Indeed',
    category: 'Job Boards',
    description: 'Search and import job listings from Indeed.',
    icon: FileText,
    fields: [{ key: 'apiKey', label: 'Publisher Key', placeholder: 'pub_...', type: 'password' }],
  },
  {
    name: 'Glassdoor',
    category: 'Job Boards',
    description: 'Discover jobs and company reviews from Glassdoor.',
    icon: FileText,
    fields: [{ key: 'apiKey', label: 'API Token', placeholder: 'gd_...', type: 'password' }],
  },
  {
    name: 'Gmail',
    category: 'Email',
    description: 'Send application emails and track recruiter replies.',
    icon: Mail,
    fields: [{ key: 'clientId', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' }, { key: 'clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-...', type: 'password' }],
  },
  {
    name: 'SMTP',
    category: 'Email',
    description: 'Send emails through your own SMTP server.',
    icon: Mail,
    fields: [
      { key: 'host', label: 'Host', placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Port', placeholder: '587' },
      { key: 'user', label: 'Username', placeholder: 'you@example.com' },
      { key: 'pass', label: 'Password', placeholder: '••••••••', type: 'password' },
    ],
  },
  {
    name: 'GitHub',
    category: 'Developer',
    description: 'Showcase repos and contributions on your resume.',
    icon: Github,
    fields: [{ key: 'token', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' }],
  },
  {
    name: 'Slack',
    category: 'Notifications',
    description: 'Get job alerts and application updates in Slack.',
    icon: Slack,
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/...' }],
  },
  {
    name: 'Google Drive',
    category: 'Storage',
    description: 'Store and sync resumes and documents to Drive.',
    icon: Cloud,
    fields: [{ key: 'clientId', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' }, { key: 'clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-...', type: 'password' }],
  },
  {
    name: 'Google Calendar',
    category: 'Scheduling',
    description: 'Schedule interviews and reminders automatically.',
    icon: Calendar,
    fields: [{ key: 'clientId', label: 'Client ID', placeholder: 'xxxx.apps.googleusercontent.com' }, { key: 'clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-...', type: 'password' }],
  },
  {
    name: 'OpenAI',
    category: 'AI Providers',
    description: 'Power AI agents, resume optimization, and chat.',
    icon: MessageSquare,
    fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-...', type: 'password' }],
  },
  {
    name: 'Anthropic Claude',
    category: 'AI Providers',
    description: 'Use Claude models for resume writing and analysis.',
    icon: MessageSquare,
    fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'sk-ant-...', type: 'password' }],
  },
  {
    name: 'Google Gemini',
    category: 'AI Providers',
    description: 'Use Gemini for job matching and content generation.',
    icon: MessageSquare,
    fields: [{ key: 'apiKey', label: 'API Key', placeholder: 'AIza...', type: 'password' }],
  },
  {
    name: 'Apify',
    category: 'Scraping',
    description: 'Run Apify actors for advanced job board scraping.',
    icon: Webhook,
    fields: [{ key: 'token', label: 'API Token', placeholder: 'apify_api_...', type: 'password' }],
  },
  {
    name: 'Supabase',
    category: 'Storage',
    description: 'Connect to an external Supabase project for data storage.',
    icon: Database,
    fields: [
      { key: 'url', label: 'Project URL', placeholder: 'https://xxxx.supabase.co' },
      { key: 'anonKey', label: 'Anon Key', placeholder: 'eyJ...', type: 'password' },
    ],
  },
  {
    name: 'Chrome Extension',
    category: 'Browser',
    description: 'Auto-fill applications from the Chrome extension.',
    icon: Chrome,
    fields: [{ key: 'extensionId', label: 'Extension ID', placeholder: 'abcdefghijklmnopqrstuvwxyz' }],
  },
];

export function IntegrationsPage() {
  const qc = useQueryClient();
  const { data: integrations } = useQuery({ queryKey: ['integrations'], queryFn: () => services.integration.list() });
  const [selected, setSelected] = useState<Integration | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addEntry, setAddEntry] = useState<CatalogEntry | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const categories = Array.from(new Set(integrations?.map((i) => i.category) || []));

  const connectedNames = new Set(integrations?.map((i) => i.name) || []);
  const available = CATALOG.filter((c) => !connectedNames.has(c.name));

  const test = async (id: string) => {
    toast.success('Testing connection...');
    const res = await services.integration.testConnection(id);
    toast.success(res.message);
    qc.invalidateQueries({ queryKey: ['integrations'] });
  };

  const toggle = async (id: string) => {
    await services.integration.toggle(id);
    toast.success('Integration updated');
    qc.invalidateQueries({ queryKey: ['integrations'] });
  };

  const openAdd = (entry: CatalogEntry) => {
    setAddEntry(entry);
    setCredentials({});
  };

  const confirmAdd = async () => {
    if (!addEntry) return;
    try {
      const { error } = await supabase.from('integrations').insert({
        name: addEntry.name,
        category: addEntry.category,
        description: addEntry.description,
        icon: addEntry.icon.name,
        status: 'disconnected',
        credentials: credentials,
      });
      if (error) throw error;
      toast.success(`${addEntry.name} added`);
      setShowAdd(false);
      setAddEntry(null);
      qc.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to add integration');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Integrations"
        description="Connect external services and APIs"
        actions={
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Integration
          </Button>
        }
      />

      {categories.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={PlugZap}
              title="No integrations yet"
              description="Connect external services and APIs to enhance your workflow."
              action={
                <Button onClick={() => setShowAdd(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Add Integration
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        categories.map((cat) => (
          <div key={cat} className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {integrations?.filter((i) => i.category === cat).map((int, i) => {
                const Icon = CATALOG.find((c) => c.name === int.name)?.icon || Plug;
                return (
                  <motion.div key={int.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(int)}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          {int.status === 'connected' ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <p className="mt-3 font-semibold">{int.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{int.description}</p>
                        {int.lastSync && <p className="mt-2 text-xs text-muted-foreground">Synced {timeAgo(int.lastSync)}</p>}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Add Integration Dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) setAddEntry(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Integration</DialogTitle>
            <DialogDescription>Choose a service to connect to your job search workspace.</DialogDescription>
          </DialogHeader>

          {!addEntry ? (
            <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-2">
              {Array.from(new Set(CATALOG.map((c) => c.category))).map((cat) => (
                <div key={cat} className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {CATALOG.filter((c) => c.category === cat).map((entry) => {
                      const isConnected = connectedNames.has(entry.name);
                      const Icon = entry.icon;
                      return (
                        <button
                          key={entry.name}
                          onClick={() => openAdd(entry)}
                          disabled={isConnected}
                          className="flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Icon className="h-4.5 w-4.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{entry.name}</p>
                              {isConnected && <Badge variant="secondary" className="text-[10px]">Connected</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{entry.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <addEntry.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{addEntry.name}</p>
                  <p className="text-xs text-muted-foreground">{addEntry.description}</p>
                </div>
              </div>
              <div className="space-y-3">
                {addEntry.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    <Input
                      type={field.type === 'password' ? 'password' : 'text'}
                      placeholder={field.placeholder}
                      value={credentials[field.key] || ''}
                      onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            {addEntry ? (
              <>
                <Button variant="outline" onClick={() => setAddEntry(null)}>Back</Button>
                <Button onClick={confirmAdd} className="gap-2"><Plus className="h-4 w-4" /> Add</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Existing Integration Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{selected.name}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">{selected.description}</p>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                {selected.lastSync && <span className="text-xs text-muted-foreground">Last sync: {timeAgo(selected.lastSync)}</span>}
              </div>
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <Input type="password" placeholder="sk-..." defaultValue="sk-demo-key-xxxxx" />
              </div>
              {selected.logs.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Logs</p>
                  <div className="space-y-1">
                    {selected.logs.map((log) => (
                      <div key={log.id} className="flex items-center gap-2 rounded border border-border p-2 text-xs">
                        <span className="text-muted-foreground">{timeAgo(log.timestamp)}</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => test(selected.id)} className="gap-2"><RefreshCw className="h-4 w-4" /> Test Connection</Button>
              <Button onClick={() => toggle(selected.id)} className="gap-2"><Settings className="h-4 w-4" /> {selected.status === 'connected' ? 'Disconnect' : 'Connect'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
