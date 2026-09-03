import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, RefreshCw, Loader2, StopCircle, RotateCcw, Play,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { services } from '@/services';
import { computeRunDurationMs, formatDurationMs, timeAgo } from '@/utils';
import { buildExecutionGraph } from '@/utils/execution-graph';
import type { GraphNodeView } from '@/utils/execution-graph';
import { ExecutionGraph } from '@/components/executions/ExecutionGraph';
import { ExecutionNodeDetailSheet } from '@/components/executions/ExecutionNodeDetailSheet';
import { getActiveExecutionStep } from '@/utils/execution';
import { toast } from 'sonner';

export function ExecutionDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedNode, setSelectedNode] = useState<GraphNodeView | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [stopping, setStopping] = useState(false);

  const { data: run, isLoading, error, refetch } = useQuery({
    queryKey: ['run-detail', runId],
    queryFn: () => services.execution.getRunDetail(runId!),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'running' || status === 'queued') return 5000;
      return false;
    },
  });

  const graph = useMemo(() => {
    if (!run) return null;
    return buildExecutionGraph({
      snapshot: run.workflowSnapshot,
      jobExecutions: run.jobExecutions,
      nodeExecutions: run.nodeExecutions,
      run,
    });
  }, [run]);

  const isActive = run?.status === 'running' || run?.status === 'queued';
  const canRetry = run && !isActive && (run.jobsFailed ?? graph?.jobsFailed ?? 0) > 0;
  const activeStep = run ? getActiveExecutionStep(run) : null;

  const handleRetry = async () => {
    if (!runId) return;
    setRetrying(true);
    try {
      const result = await services.execution.retryFailedJobs(runId);
      toast.success(`Retrying ${result.retriedJobs} failed job(s)`);
      await qc.invalidateQueries({ queryKey: ['run-detail', runId] });
      await qc.invalidateQueries({ queryKey: ['runs'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const handleRunAgain = async () => {
    if (!run?.workflowId) return;
    try {
      const newRun = await services.execution.runWorkflow(run.workflowId);
      toast.success('New execution started');
      navigate(`/executions/${newRun.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start workflow');
    }
  };

  const handleStop = async () => {
    if (!runId) return;
    setStopping(true);
    try {
      await services.execution.cancelRun(runId);
      toast.success('Execution stopped');
      await refetch();
      await qc.invalidateQueries({ queryKey: ['runs'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop');
    } finally {
      setStopping(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" className="gap-2" onClick={() => navigate('/executions')}>
          <ArrowLeft className="h-4 w-4" /> Back to executions
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {error instanceof Error ? error.message : 'Execution not found'}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate('/executions')}>
          <ArrowLeft className="h-4 w-4" /> Executions
        </Button>
      </div>

      <PageHeader
        title={run.workflowName || 'Workflow'}
        description={`Run ${run.id.slice(0, 8)}…`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            {isActive && (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={stopping} onClick={handleStop}>
                {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}
                Stop
              </Button>
            )}
            {canRetry && (
              <Button size="sm" className="gap-1.5" disabled={retrying} onClick={handleRetry}>
                {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Retry Failed Jobs
              </Button>
            )}
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={handleRunAgain}>
              <Play className="h-3.5 w-3.5" /> Run Again
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={run.status} />
            <span className="text-sm text-muted-foreground font-mono">{run.id}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong>{graph?.jobsTotal ?? 0}</strong> Jobs</span>
            <span className="text-success"><strong>{graph?.jobsSuccessful ?? 0}</strong> Successful</span>
            <span className="text-destructive"><strong>{graph?.jobsFailed ?? 0}</strong> Failed</span>
            <span><strong>{graph?.jobsSkipped ?? 0}</strong> Skipped</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            {run.finishedAt && <span>Completed: {new Date(run.finishedAt).toLocaleString()}</span>}
            <span>Duration: {formatDurationMs(computeRunDurationMs(run))}{isActive ? ' (live)' : ''}</span>
            <span>{timeAgo(run.startedAt)}</span>
          </div>
          {run.errorMessage && (
            <p className="text-sm text-destructive">{run.errorMessage}</p>
          )}
          {activeStep && isActive && (
            <p className="text-sm text-primary">
              Running: {activeStep.name}
              {activeStep.detail ? ` · ${activeStep.detail}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {graph && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Execution graph
          </p>
          <ExecutionGraph graph={graph} onSelectNode={setSelectedNode} />
        </div>
      )}

      <ExecutionNodeDetailSheet
        open={Boolean(selectedNode)}
        onOpenChange={(open) => !open && setSelectedNode(null)}
        node={selectedNode}
        run={run}
      />
    </div>
  );
}
