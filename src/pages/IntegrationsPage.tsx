import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, RefreshCw, Settings, Plus, Webhook, Cloud, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { services } from '@/services';
import { requireUserId } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/utils';
import { toast } from 'sonner';
import type { Integration } from '@/types';

interface CoreIntegration {
  name: string;
  category: string;
  description: string;
  note: string;
  icon: LucideIcon;
  optional: boolean;
}

const CORE: CoreIntegration[] = [
  {
    name: 'Apify',
    category: 'Scraping',
    description: 'LinkedIn job scrape for Run Search and the daily pipeline.',
    note: 'Usually the APIFY_TOKEN Edge Function secret. Add a personal token only if you are not using that shared secret.',
    icon: Webhook,
    optional: false,
  },
  {
    name: 'Google Drive',
    category: 'Storage',
    description: 'Upload tailored PDFs to your Drive. Not used for resume tailoring.',
    note: 'Connect with OAuth. Skip this if you only need in-app resumes and storage.',
    icon: Cloud,
    optional: true,
  },
];

export function IntegrationsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: integrations } = useQuery({ queryKey: ['integrations'], queryFn: () => services.integration.list() });
  const [selected, setSelected] = useState<Integration | null>(null);
  const [showApify, setShowApify] = useState(false);
  const [apifyToken, setApifyToken] = useState('');

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === 'google') {
      toast.success('Google Drive connected');
      qc.invalidateQueries({ queryKey: ['integrations'] });
      setSearchParams({}, { replace: true });
    } else if (error) {
      toast.error(decodeURIComponent(error));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, qc]);

  const byName = new Map((integrations || []).map((i) => [i.name, i]));

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

  const connectGoogle = async () => {
    try {
      const url = await services.integration.connectGoogle();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'OAuth failed');
    }
  };

  const saveApify = async () => {
    const token = apifyToken.trim();
    if (!token) {
      toast.error('Paste an Apify API token');
      return;
    }
    try {
      const userId = await requireUserId();
      const existing = byName.get('Apify');
      if (existing) {
        const { error } = await supabase.from('integrations').update({
          credentials: { token },
          status: 'connected',
          last_sync: new Date().toISOString(),
        }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('integrations').insert({
          user_id: userId,
          name: 'Apify',
          category: 'Scraping',
          description: CORE[0].description,
          icon: 'Webhook',
          status: 'connected',
          credentials: { token },
        });
        if (error) throw error;
      }
      toast.success('Apify token saved');
      setShowApify(false);
      setApifyToken('');
      qc.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Apify');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Integrations"
        description="Only two connections exist: Apify for job scrape, Google Drive for optional PDF upload. Gemini and email use Edge Function secrets, not this page."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {CORE.map((core, i) => {
          const int = byName.get(core.name);
          const connected = int?.status === 'connected';
          const Icon = core.icon;
          return (
            <motion.div key={core.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className={int ? 'cursor-pointer transition-colors hover:bg-accent/30' : ''} onClick={() => int && setSelected(int)}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    {connected ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <p className="font-semibold">{core.name}</p>
                    {core.optional && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Optional</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{core.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{core.note}</p>
                  {int?.lastSync && <p className="mt-2 text-xs text-muted-foreground">Synced {timeAgo(int.lastSync)}</p>}
                  <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {core.name === 'Google Drive' && (
                      <Button variant="outline" size="sm" onClick={connectGoogle}>
                        {connected ? 'Reconnect Google' : 'Connect Google'}
                      </Button>
                    )}
                    {core.name === 'Apify' && (
                      <Button variant="outline" size="sm" onClick={() => { setShowApify(true); setApifyToken(''); }}>
                        {connected ? 'Update token' : 'Add personal token'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={showApify} onOpenChange={setShowApify}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apify API token</DialogTitle>
            <DialogDescription>
              Skip this if APIFY_TOKEN is already set as an Edge Function secret. A personal token overrides that for your account only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>API token</Label>
            <Input
              type="password"
              placeholder="apify_api_…"
              value={apifyToken}
              onChange={(e) => setApifyToken(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApify(false)}>Cancel</Button>
            <Button onClick={saveApify} className="gap-2"><Plus className="h-4 w-4" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
