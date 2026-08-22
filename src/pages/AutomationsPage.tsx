import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Play, Pause, Copy, Clock, Zap, ZapOff } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { services } from '@/services';
import { EmptyState } from '@/components/shared/EmptyState';
import { timeAgo } from '@/utils';
import { toast } from 'sonner';
import { useState } from 'react';

export function AutomationsPage() {
  const qc = useQueryClient();
  const { data: automations } = useQuery({ queryKey: ['automations'], queryFn: () => services.automation.list() });
  const { data: workflows } = useQuery({ queryKey: ['workflows'], queryFn: () => services.workflow.list() });
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('Daily Job Search');
  const [workflowId, setWorkflowId] = useState('');
  const [schedule, setSchedule] = useState('0 7 * * *');

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

  const create = async () => {
    if (!workflowId) { toast.error('Select a workflow'); return; }
    await services.automation.create(name, workflowId, schedule);
    toast.success('Automation created');
    setShowCreate(false);
    qc.invalidateQueries({ queryKey: ['automations'] });
  };

  const runNow = async (workflowId: string) => {
    toast.success('Starting workflow...');
    await services.execution.runWorkflow(workflowId);
    toast.success('Workflow started');
    qc.invalidateQueries({ queryKey: ['runs'] });
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Automations"
        description="Your daily job search runs automatically — manage schedules and triggers"
        actions={
          <Button onClick={() => setShowCreate(true)} className="gap-2"><Zap className="h-4 w-4" /> New Automation</Button>
        }
      />

      {(!automations || automations.length === 0) ? (
        <Card><CardContent><EmptyState icon={ZapOff} title="No automations yet" description="Your daily 7 AM job search automation is provisioned automatically. It should appear shortly, or create a custom automation." action={<Button onClick={() => setShowCreate(true)} className="gap-2"><Zap className="h-4 w-4" /> New Automation</Button>} /></CardContent></Card>
      ) : (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automations.map((auto, i) => (
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
                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggle(auto.id)} className="gap-1.5">
                    {auto.status === 'active' ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => runNow(auto.workflowId)} className="gap-1.5"><Play className="h-3.5 w-3.5" /> Run Now</Button>
                  <Button variant="ghost" size="sm" onClick={() => clone(auto.id)} className="gap-1.5"><Copy className="h-3.5 w-3.5" /> Clone</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Automation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Workflow</Label>
              <Select value={workflowId} onValueChange={setWorkflowId}>
                <SelectTrigger><SelectValue placeholder="Select workflow" /></SelectTrigger>
                <SelectContent>
                  {(workflows || []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Cron Schedule</Label><Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 7 * * *" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={create}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
