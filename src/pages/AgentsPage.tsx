import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Bot, Plus, Play, Pause, Settings, Trash2, Activity,
  DollarSign, Clock, Zap, BarChart3, Cpu,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { services } from '@/services';
import { AI_PROVIDERS } from '@/constants';
import { timeAgo, formatCurrency } from '@/utils';
import { toast } from 'sonner';
import type { Agent } from '@/types';

export function AgentsPage() {
  const qc = useQueryClient();
  const { data: agents } = useQuery({ queryKey: ['agents'], queryFn: () => services.agent.list() });
  const [selected, setSelected] = useState<Agent | null>(null);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="AI Agents"
        description="Autonomous agents that handle your job search tasks"
        actions={
          <Button className="gap-2"><Plus className="h-4 w-4" /> Create Agent</Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents?.map((agent, i) => (
          <motion.div key={agent.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(agent)}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <Switch checked={agent.enabled} onCheckedChange={async (c) => {
                    await services.agent.update(agent.id, { enabled: c });
                    qc.invalidateQueries({ queryKey: ['agents'] });
                  }} onClick={(e) => e.stopPropagation()} />
                </div>
                <p className="mt-3 font-semibold">{agent.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground"><Cpu className="h-3 w-3" />{agent.model}</div>
                  <div className="flex items-center gap-1.5 text-muted-foreground"><Activity className="h-3 w-3" />{agent.metrics.runs} runs</div>
                  <div className="flex items-center gap-1.5 text-muted-foreground"><BarChart3 className="h-3 w-3" />{agent.metrics.successRate}%</div>
                  <div className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="h-3 w-3" />${agent.metrics.totalCost.toFixed(2)}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {selected && <AgentEditor agent={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AgentEditor({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState(agent.prompt);
  const [model, setModel] = useState(agent.model);
  const [temperature, setTemperature] = useState(agent.temperature);
  const [memory, setMemory] = useState(agent.memory);
  const [running, setRunning] = useState(false);

  const save = async () => {
    await services.agent.update(agent.id, { prompt, model, temperature, memory });
    toast.success('Agent updated');
    qc.invalidateQueries({ queryKey: ['agents'] });
    onClose();
  };

  const run = async () => {
    setRunning(true);
    toast.success(`Running ${agent.name}...`);
    await services.agent.run(agent.id, prompt);
    setRunning(false);
    toast.success('Agent run completed');
    qc.invalidateQueries({ queryKey: ['agents'] });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> {agent.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="history">Execution History</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4">
            <div className="space-y-1.5">
              <Label>System Prompt</Label>
              <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Select value={model} onValueChange={(v) => setModel(v as Agent['model'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map((p) => p.models.map((m) => <SelectItem key={m} value={p.id}>{p.name} · {m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Memory</Label>
                <div className="flex items-center gap-2 pt-2"><Switch checked={memory} onCheckedChange={setMemory} /><span className="text-sm text-muted-foreground">{memory ? 'Enabled' : 'Disabled'}</span></div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Temperature: {temperature.toFixed(2)}</Label>
              <Slider value={[temperature]} onValueChange={(v) => setTemperature(v[0])} min={0} max={1} step={0.05} />
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            <ScrollArea className="h-[50vh] pr-3">
              {agent.runs.map((run) => (
                <div key={run.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={run.status} />
                    <span className="text-xs text-muted-foreground">{timeAgo(run.startedAt)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Input: {run.input}</p>
                  <p className="mt-1 text-xs">{run.output}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{(run.duration / 1000).toFixed(1)}s</span>
                    <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{run.tokens} tokens</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />${run.cost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Runs</p><p className="mt-1 text-2xl font-semibold">{agent.metrics.runs}</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Success Rate</p><p className="mt-1 text-2xl font-semibold text-success">{agent.metrics.successRate}%</p><Progress value={agent.metrics.successRate} className="mt-2 h-1.5" /></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Avg Latency</p><p className="mt-1 text-2xl font-semibold">{(agent.metrics.avgLatency / 1000).toFixed(1)}s</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total Cost</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(agent.metrics.totalCost)}</p></CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={run} disabled={running} className="gap-2"><Play className="h-4 w-4" /> {running ? 'Running...' : 'Run Now'}</Button>
          <Button onClick={save} className="gap-2"><Settings className="h-4 w-4" /> Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
