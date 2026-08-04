import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Play, Pause, Copy, Download, Upload, Clock, RefreshCw,
  Zap, History,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { services } from '@/services';
import { timeAgo } from '@/utils';
import { toast } from 'sonner';
import { useState } from 'react';

export function AutomationsPage() {
  const qc = useQueryClient();
  const { data: automations } = useQuery({ queryKey: ['automations'], queryFn: () => services.automation.list() });

  const toggle = async (id: string) => {
    await services.automation.toggle(id);
    toast.success('Automation updated');
    qc.invalidateQueries({ queryKey: ['automations'] });
  };

  const clone = async (id: string) => {
    await services.automation.clone(id);
    toast.success('Automation cloned');
    qc.invalidateQueries({ queryKey: ['automations'] });
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Automations"
        description="Schedule, trigger, and manage your automated workflows"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Import</Button>
            <Button className="gap-2"><Zap className="h-4 w-4" /> New Automation</Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automations?.map((auto, i) => (
          <motion.div key={auto.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <StatusBadge status={auto.status} />
                </div>
                <p className="mt-3 font-semibold">{auto.name}</p>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {auto.schedule}</p>
                  <p>Trigger: {auto.trigger}</p>
                  {auto.lastRun && <p>Last run: {timeAgo(auto.lastRun)}</p>}
                  {auto.nextRun && <p>Next run: {timeAgo(auto.nextRun)}</p>}
                </div>
                {auto.retries > 0 && <Badge variant="secondary" className="mt-2 text-[10px]">{auto.retries} retries</Badge>}
                <div className="mt-3 flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggle(auto.id)} className="gap-1.5">
                    {auto.status === 'active' ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => clone(auto.id)} className="gap-1.5"><Copy className="h-3.5 w-3.5" /> Clone</Button>
                  <Button variant="ghost" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Export</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
