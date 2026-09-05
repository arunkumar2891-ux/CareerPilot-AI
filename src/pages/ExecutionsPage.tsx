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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { services } from '@/services';
import { computeRunDurationMs, formatDurationMs, formatExecutionStart, timeAgo, describeTriggerType } from '@/utils';
import { getActiveExecutionStep } from '@/utils/execution';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import type { WorkflowRun, WorkflowRunStatus } from '@/types';

export function ExecutionsPage() {
  const navigate = useNavigate();
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
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);

  const isActiveRun = (status: WorkflowRunStatus) => status === 'running' || status === 'queued';

  const allRuns = (runs || []).slice(0, 20);
  const deleteTarget = deleteTargetId ? allRuns.find((r) => r.id === deleteTargetId) : null;

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
    const detail = batch ? `Job ${batch.index}/${batch.total}` : step.detail;
    return `${step.name}${detail ? ` · ${detail}` : ''} · ${elapsed}`;
  };

  const describeRunSummary = (run: WorkflowRun) => {
    if (isActiveRun(run.status)) return describeRunProgress(run);
    const parts = [formatExecutionStart(run.startedAt), timeAgo(run.startedAt)];
    if (run.jobsTotal && run.jobsTotal > 0) {
      parts.push(`${run.jobsTotal} jobs`);
      if (run.jobsFailed) parts.push(`${run.jobsFailed} failed`);
    } else {
      parts.push(`${run.nodeResults.length} nodes`);
    }
    parts.push(run.id.slice(0, 8));
    return parts.join(' · ');
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Execution Center"
        description="Open a run to view the execution graph, per-job branches, and node logs"
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
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10"><XCircle className="h-5 w-5 text-destructive" /></div><div><p className="text-xs text-muted-foreground">Failed / Partial</p><p className="text-xl font-semibold">{allRuns.filter((r) => r.status === 'failed' || r.status === 'partially_failed').length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Avg Duration</p><p className="text-xl font-semibold">{allRuns.length > 0 ? formatDurationMs(allRuns.reduce((a, r) => a + computeRunDurationMs(r), 0) / allRuns.length) : '0.0s'}</p></div></div></CardContent></Card>
      </div>

      <div className="space-y-2">
        {allRuns.length === 0 ? (
          <Card><CardContent><EmptyState icon={Inbox} title="No executions yet" description="Workflow runs will appear here once you execute them." /></CardContent></Card>
        ) : allRuns.map((run, i) => (
          <motion.div key={run.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent/30"
              onClick={() => navigate(`/executions/${run.id}`)}
            >
              <CardContent className="flex items-center gap-4 py-3">
                {run.status === 'success' ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : run.status === 'failed' ? <XCircle className="h-4 w-4 text-destructive" />
                  : run.status === 'partially_failed' ? <AlertCircle className="h-4 w-4 text-warning" />
                  : run.status === 'cancelled' ? <StopCircle className="h-4 w-4 text-warning" />
                  : isActiveRun(run.status) ? <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
                  : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="truncate text-sm font-medium">{run.workflowName || 'Workflow'}</p>
                    <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                      {describeTriggerType(run.triggerType)}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{describeRunSummary(run)}</p>
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
    </div>
  );
}
