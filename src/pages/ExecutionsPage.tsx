import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Activity,
  ChevronRight, Inbox, Trash2, StopCircle,
} from 'lucide-react';
import { InlineLoader, PageLoader, StaggerItem, StaggerList } from '@/components/motion';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { resolveRunIdLookup } from '@/utils/run-id';
import type { WorkflowRun, WorkflowRunStatus } from '@/types';

export function ExecutionsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: runs, isLoading, error: runsError } = useQuery({
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
  const [runIdLookup, setRunIdLookup] = useState('');

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

  const jobProgressLabel = (run: WorkflowRun) => {
    const total = run.jobsTotal ?? 0;
    if (total < 2) return undefined;
    const done = (run.jobsSuccessful ?? 0) + (run.jobsFailed ?? 0) + (run.jobsSkipped ?? 0);
    return `Job ${Math.min(done + 1, total)}/${total}`;
  };

  const describeRunProgress = (run: WorkflowRun) => {
    const step = getActiveExecutionStep(run);
    const jobDetail = jobProgressLabel(run);
    if (!step) {
      return jobDetail ? `${jobDetail} · ${run.nodeResults.length} nodes completed` : `${run.nodeResults.length} nodes completed`;
    }
    const elapsed = formatDurationMs(Date.now() - new Date(step.startedAt).getTime());
    const batch = run.batchProgress;
    const detail = batch && batch.node === step.name
      ? `Job ${batch.index}/${batch.total}`
      : (step.detail || jobDetail);
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

  const openRunById = () => {
    const runId = resolveRunIdLookup(runIdLookup, allRuns.map((run) => run.id));
    if (!runId) {
      toast.error('Enter a full run id, or a unique prefix from the list below');
      return;
    }
    navigate(`/executions/${runId}`);
  };

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Execution Center"
        description="Paste a run id to open its logs, or pick a recent execution"
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
              {deleting ? <InlineLoader /> : <Trash2 className="h-4 w-4" />}
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
              {deleting ? <InlineLoader /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form
        className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          openRunById();
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="run-id-lookup">Open logs by run id</Label>
          <Input
            id="run-id-lookup"
            value={runIdLookup}
            onChange={(e) => setRunIdLookup(e.target.value)}
            placeholder="Paste a workflow run UUID"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" className="shrink-0">Open</Button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10"><CheckCircle2 className="h-5 w-5 text-success" /></div><div><p className="text-xs text-muted-foreground">Successful</p><p className="text-xl font-semibold">{allRuns.filter((r) => r.status === 'success').length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10"><XCircle className="h-5 w-5 text-destructive" /></div><div><p className="text-xs text-muted-foreground">Failed / Partial</p><p className="text-xl font-semibold">{allRuns.filter((r) => r.status === 'failed' || r.status === 'partially_failed').length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Avg Duration</p><p className="text-xl font-semibold">{allRuns.length > 0 ? formatDurationMs(allRuns.reduce((a, r) => a + computeRunDurationMs(r), 0) / allRuns.length) : '0.0s'}</p></div></div></CardContent></Card>
      </div>

      {runsError && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive">
            Could not load executions: {runsError instanceof Error ? runsError.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <PageLoader label="Loading executions…" />
        ) : allRuns.length === 0 ? (
          <Card><CardContent><EmptyState icon={Inbox} title="No executions yet" description="Workflow runs will appear here once you execute them." /></CardContent></Card>
        ) : (
        <StaggerList className="space-y-2">
        {allRuns.map((run) => (
          <StaggerItem key={run.id}>
            <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => navigate(`/executions/${run.id}`)}>
              <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
                {run.status === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success sm:mt-0" />
                  : run.status === 'failed' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive sm:mt-0" />
                  : run.status === 'cancelled' ? <StopCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning sm:mt-0" />
                  : isActiveRun(run.status) ? <InlineLoader className="mt-0.5 shrink-0 sm:mt-0" />
                  : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{run.workflowName || 'Workflow'}</p>
                    <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                      {describeTriggerType(run.triggerType)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground break-words sm:truncate">
                    {describeRunSummary(run)}
                  </p>
                </div>
                </div>
                <div className="flex items-center justify-end gap-1 pl-7 sm:ml-auto sm:gap-2 sm:pl-0">
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
                      ? <InlineLoader />
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
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
        </StaggerList>
        )}
      </div>
    </div>
  );
}
