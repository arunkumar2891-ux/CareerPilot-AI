import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Activity,
  ChevronRight, Inbox, Loader2, Trash2, RefreshCw, StopCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { services } from '@/services';
import { computeRunDurationMs, formatDurationMs, timeAgo } from '@/utils';
import {
  getActiveExecutionStep,
  buildPipelineSteps,
  type PipelineStepView,
} from '@/utils/execution';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import type { WorkflowRun, WorkflowRunStatus } from '@/types';

function NodeStatusIcon({ status }: { status: WorkflowRunStatus | 'pending' }) {
  if (status === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === 'cancelled') return <StopCircle className="h-3.5 w-3.5 text-warning" />;
  if (status === 'running' || status === 'queued') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  }
  if (status === 'pending') return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function PipelineStepRow({ step }: { step: PipelineStepView }) {
  const isActive = step.status === 'running' || step.status === 'queued';
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-2 text-xs ${
        isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border'
      }`}
    >
      <NodeStatusIcon status={step.status} />
      <span className="flex-1 truncate font-medium">{step.name}</span>
      {step.status === 'pending' ? (
        <span className="text-muted-foreground">pending</span>
      ) : (
        <span className="text-muted-foreground">{formatDurationMs(step.duration)}</span>
      )}
    </div>
  );
}

export function ExecutionsPage() {
  const qc = useQueryClient();
  const { data: runs } = useQuery({
    queryKey: ['runs'],
    queryFn: () => services.execution.listRuns(),
    refetchInterval: (query) => {
      const items = query.state.data;
      if (!items?.some((r) => r.status === 'running' || r.status === 'queued')) return false;
      return 5000;
    },
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);

  const isActiveRun = (status: WorkflowRunStatus) => status === 'running' || status === 'queued';

  const allRuns = (runs || []).slice(0, 20);
  const selected = selectedId ? allRuns.find((r) => r.id === selectedId) : null;
  const deleteTarget = deleteTargetId ? allRuns.find((r) => r.id === deleteTargetId) : null;

  const { data: workflow } = useQuery({
    queryKey: ['workflow', selected?.workflowId],
    queryFn: () => services.workflow.get(selected!.workflowId),
    enabled: Boolean(selected?.workflowId),
  });

  const activeStep = selected ? getActiveExecutionStep(selected) : null;
  const pipelineSteps = workflow
    ? buildPipelineSteps(
        workflow.nodes.map((n) => ({ id: n.id, name: n.name, positionX: n.position.x })),
        selected?.nodeResults ?? [],
        activeStep,
      )
    : [];

  const refreshRuns = async () => {
    await qc.invalidateQueries({ queryKey: ['runs'] });
  };

  const stopRun = async (runId: string) => {
    setStoppingRunId(runId);
    try {
      await services.execution.cancelRun(runId);
      qc.setQueryData(['runs'], (prev: WorkflowRun[] | undefined) =>
        (prev || []).map((r) =>
          r.id === runId
            ? { ...r, status: 'cancelled' as const, errorMessage: 'Stopped by user', currentNodeId: undefined }
            : r,
        ),
      );
      await refreshRuns();
      toast.success('Execution stopped');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop execution');
    } finally {
      setStoppingRunId(null);
    }
  };

  const deleteRun = async (runId: string) => {
    setDeleting(true);
    try {
      await services.execution.deleteRun(runId);
      if (selectedId === runId) setSelectedId(null);
      await refreshRuns();
      toast.success('Execution deleted');
      setDeleteTargetId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete execution');
    } finally {
      setDeleting(false);
    }
  };

  const deleteAllRuns = async () => {
    setDeleting(true);
    try {
      const count = await services.execution.deleteAllRuns();
      setSelectedId(null);
      await refreshRuns();
      toast.success(`Deleted ${count} execution${count === 1 ? '' : 's'}`);
      setShowClearConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete executions');
    } finally {
      setDeleting(false);
    }
  };

  const describeRunProgress = (run: WorkflowRun) => {
    const step = getActiveExecutionStep(run);
    if (!step) return `${run.nodeResults.length} nodes completed`;
    const elapsed = formatDurationMs(Date.now() - new Date(step.startedAt).getTime());
    const batch = run.batchProgress;
    const detail = batch
      ? `Job ${batch.index}/${batch.total}`
      : step.detail;
    return `${step.name}${detail ? ` · ${detail}` : ''} · ${elapsed}`;
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Execution Center"
        description="Status updates every 5s while a run is active (not re-running the workflow)"
        actions={
          <Button
            variant="outline"
            onClick={() => setShowClearConfirm(true)}
            className="gap-2"
            disabled={!allRuns.length}
          >
            <Trash2 className="h-4 w-4" /> Clear All
          </Button>
        }
      />

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all executions?</DialogTitle>
            <DialogDescription>
              This permanently removes execution history, node results, and logs from Supabase. Running workflows may behave unpredictably if deleted mid-run.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={deleteAllRuns} disabled={deleting} className="gap-2">
              {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this execution?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.workflowName || 'Workflow'} — started {deleteTarget ? timeAgo(deleteTarget.startedAt) : ''}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTargetId && deleteRun(deleteTargetId)}
              disabled={deleting || !deleteTargetId}
              className="gap-2"
            >
              {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10"><CheckCircle2 className="h-5 w-5 text-success" /></div><div><p className="text-xs text-muted-foreground">Successful</p><p className="text-xl font-semibold">{allRuns.filter((r) => r.status === 'success').length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10"><XCircle className="h-5 w-5 text-destructive" /></div><div><p className="text-xs text-muted-foreground">Failed</p><p className="text-xl font-semibold">{allRuns.filter((r) => r.status === 'failed').length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Avg Duration</p><p className="text-xl font-semibold">{allRuns.length > 0 ? formatDurationMs(allRuns.reduce((a, r) => a + computeRunDurationMs(r), 0) / allRuns.length) : '0.0s'}</p></div></div></CardContent></Card>
      </div>

      <div className="space-y-2">
        {allRuns.length === 0 ? (
          <Card><CardContent><EmptyState icon={Inbox} title="No executions yet" description="Workflow runs will appear here once you execute them." /></CardContent></Card>
        ) : allRuns.map((run, i) => (
          <motion.div key={run.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => setSelectedId(run.id)}>
              <CardContent className="flex items-center gap-4 py-3">
                {run.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : run.status === 'failed' ? <XCircle className="h-4 w-4 text-destructive" />
                  : run.status === 'cancelled' ? <StopCircle className="h-4 w-4 text-warning" />
                  : isActiveRun(run.status) ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{run.workflowName || 'Workflow'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {isActiveRun(run.status)
                      ? describeRunProgress(run)
                      : `${timeAgo(run.startedAt)} · ${run.nodeResults.length} nodes`}
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{formatDurationMs(computeRunDurationMs(run))}</Badge>
                {isActiveRun(run.status) && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={stoppingRunId === run.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      stopRun(run.id);
                    }}
                    aria-label="Stop execution"
                  >
                    {stoppingRunId === run.id
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <StopCircle className="h-4 w-4 text-warning" />}
                  </Button>
                )}
                <StatusBadge status={run.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTargetId(run.id);
                  }}
                  aria-label="Delete execution"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelectedId(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" /> {selected.workflowName || 'Workflow'}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 pr-3">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <StatusBadge status={selected.status} />
                  <span className="text-xs text-muted-foreground">Started {timeAgo(selected.startedAt)}</span>
                  <span className="text-xs text-muted-foreground">
                    Duration: {formatDurationMs(computeRunDurationMs(selected))}
                    {isActiveRun(selected.status) && (
                      <span className="ml-1 text-primary">(live)</span>
                    )}
                  </span>
                  {isActiveRun(selected.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={stoppingRunId === selected.id}
                      onClick={() => stopRun(selected.id)}
                    >
                      {stoppingRunId === selected.id
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <StopCircle className="h-3.5 w-3.5 text-warning" />}
                      Stop
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTargetId(selected.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>

                {selected.errorMessage && (
                  <Card className="border-destructive/50">
                    <CardContent className="py-3 text-sm text-destructive">{selected.errorMessage}</CardContent>
                  </Card>
                )}

                {activeStep && isActiveRun(selected.status) && (
                  <Card className="border-primary/40 bg-primary/5">
                    <CardContent className="flex items-start gap-3 py-4">
                      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Running now</p>
                        <p className="text-sm font-medium">{activeStep.name}</p>
                        {activeStep.type && (
                          <p className="text-xs text-muted-foreground">Type: {activeStep.type}</p>
                        )}
                        {activeStep.detail && !selected.batchProgress && (
                          <p className="text-xs text-muted-foreground">{activeStep.detail}</p>
                        )}
                        {selected.batchProgress && (
                          <p className="text-xs text-muted-foreground">
                            Job {selected.batchProgress.index} of {selected.batchProgress.total} ({selected.batchProgress.node})
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Step started {timeAgo(activeStep.startedAt)} (
                          {formatDurationMs(Date.now() - new Date(activeStep.startedAt).getTime())})
                        </p>
                        {activeStep.type === 'gemini' && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Each job is a separate slice (Store → ATS → PDF → Drive) so a long Gemini call cannot freeze the rest of the batch. ATS timeout is 75s per job.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pipeline progress</p>
                  <div className="space-y-1">
                    {pipelineSteps.length > 0 ? (
                      pipelineSteps.map((step) => <PipelineStepRow key={step.nodeId} step={step} />)
                    ) : (
                      selected.nodeResults.map((nr) => (
                        <div key={nr.nodeId} className="flex items-center gap-3 rounded-lg border border-border p-2 text-xs">
                          <NodeStatusIcon status={nr.status} />
                          <span className="flex-1 truncate">{nr.nodeId}</span>
                          <span className="text-muted-foreground">{formatDurationMs(nr.duration)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logs</p>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs space-y-1 max-h-56 overflow-y-auto">
                    {selected.logs.map((log) => {
                      const isHighlight =
                        log.message.startsWith('Executing node:') ||
                        log.message.startsWith('Processing item') ||
                        log.message.startsWith('Completed node:') ||
                        log.message.startsWith('Waiting until') ||
                        log.message.includes('stopped by user') ||
                        log.level === 'error' ||
                        log.level === 'warn';
                      return (
                        <div
                          key={log.id}
                          className={`flex gap-2 rounded px-1 py-0.5 ${isHighlight ? 'bg-background/80' : ''}`}
                        >
                          <span className="text-muted-foreground shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span className={
                            log.level === 'error' ? 'text-destructive shrink-0'
                              : log.level === 'warn' ? 'text-warning shrink-0'
                              : log.message.startsWith('Completed node:') ? 'text-success shrink-0'
                              : 'text-foreground shrink-0'
                          }>
                            [{log.level.toUpperCase()}]
                          </span>
                          <span className={
                            log.level === 'error' ? 'text-destructive'
                              : log.level === 'warn' ? 'text-warning'
                              : ''
                          }>{log.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
