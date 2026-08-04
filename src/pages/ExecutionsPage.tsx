import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Play, Clock, CheckCircle2, XCircle, AlertCircle, Activity,
  ChevronRight, Inbox,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';
import { services } from '@/services';
import { timeAgo } from '@/utils';
import { EmptyState } from '@/components/shared/EmptyState';
import type { Workflow } from '@/types';

export function ExecutionsPage() {
  const { data: runs } = useQuery({ queryKey: ['runs'], queryFn: () => services.execution.listRuns() });
  const [selected, setSelected] = useState<(Workflow['runs'][number] & { workflowName?: string }) | null>(null);

  const allRuns: (Workflow['runs'][number] & { workflowName?: string })[] = (runs || []).slice(0, 20);

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Execution Center" description="Real-time execution logs and history" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10"><CheckCircle2 className="h-5 w-5 text-success" /></div><div><p className="text-xs text-muted-foreground">Successful</p><p className="text-xl font-semibold">{allRuns.filter((r) => r.status === 'success').length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10"><XCircle className="h-5 w-5 text-destructive" /></div><div><p className="text-xs text-muted-foreground">Failed</p><p className="text-xl font-semibold">{allRuns.filter((r) => r.status === 'failed').length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Avg Duration</p><p className="text-xl font-semibold">{allRuns.length > 0 ? (allRuns.reduce((a, r) => a + r.duration, 0) / allRuns.length / 1000).toFixed(1) : '0.0'}s</p></div></div></CardContent></Card>
      </div>

      <div className="space-y-2">
        {allRuns.length === 0 ? (
          <Card><CardContent><EmptyState icon={Inbox} title="No executions yet" description="Workflow runs will appear here once you execute them." /></CardContent></Card>
        ) : allRuns.map((run, i) => (
          <motion.div key={run.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelected(run)}>
              <CardContent className="flex items-center gap-4 py-3">
                {run.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : run.status === 'failed' ? <XCircle className="h-4 w-4 text-destructive" />
                  : <Play className="h-4 w-4 text-primary" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{run.workflowName}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(run.startedAt)} · {run.nodeResults.length} nodes</p>
                </div>
                <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{(run.duration / 1000).toFixed(1)}s</Badge>
                <StatusBadge status={run.status} />
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> {selected.workflowName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <StatusBadge status={selected.status} />
                <span className="text-xs text-muted-foreground">Started {timeAgo(selected.startedAt)}</span>
                <span className="text-xs text-muted-foreground">Duration: {(selected.duration / 1000).toFixed(1)}s</span>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node Results</p>
                <div className="space-y-1">
                  {selected.nodeResults.map((nr) => (
                    <div key={nr.nodeId} className="flex items-center gap-3 rounded-lg border border-border p-2 text-xs">
                      {nr.status === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                      <span className="flex-1 font-mono">{nr.nodeId}</span>
                      <span className="text-muted-foreground">{(nr.duration / 1000).toFixed(1)}s</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logs</p>
                <ScrollArea className="h-48 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="space-y-1 font-mono text-xs">
                    {selected.logs.map((log) => (
                      <div key={log.id} className="flex gap-2">
                        <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={log.level === 'error' ? 'text-destructive' : log.level === 'warn' ? 'text-warning' : 'text-foreground'}>[{log.level.toUpperCase()}]</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
