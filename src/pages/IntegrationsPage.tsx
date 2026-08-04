import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plug, CheckCircle2, XCircle, RefreshCw, Settings, PlugZap } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useState } from 'react';
import { services } from '@/services';
import { EmptyState } from '@/components/shared/EmptyState';
import { timeAgo } from '@/utils';
import { toast } from 'sonner';
import type { Integration } from '@/types';

export function IntegrationsPage() {
  const qc = useQueryClient();
  const { data: integrations } = useQuery({ queryKey: ['integrations'], queryFn: () => services.integration.list() });
  const [selected, setSelected] = useState<Integration | null>(null);

  const categories = Array.from(new Set(integrations?.map((i) => i.category) || []));

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

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Integrations" description="Connect external services and APIs" />

      {categories.length === 0 ? (
        <Card><CardContent><EmptyState icon={PlugZap} title="No integrations yet" description="Connect external services and APIs to enhance your workflow." /></CardContent></Card>
      ) : categories.map((cat) => (
        <div key={cat} className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{cat}</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {integrations?.filter((i) => i.category === cat).map((int, i) => (
              <motion.div key={int.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(int)}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 capitalize">
                        <Plug className="h-5 w-5 text-primary" />
                      </div>
                      {int.status === 'connected' ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <p className="mt-3 font-semibold">{int.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{int.description}</p>
                    {int.lastSync && <p className="mt-2 text-xs text-muted-foreground">Synced {timeAgo(int.lastSync)}</p>}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      ))}

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
