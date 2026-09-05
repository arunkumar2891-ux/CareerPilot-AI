import { useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2, AlertCircle, StopCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphNodeView, JobBranchView, ExecutionGraphView } from '@/utils/execution-graph';
import type { WorkflowRunStatus } from '@/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function StatusIcon({ status }: { status: WorkflowRunStatus | 'pending' }) {
  if (status === 'success') return <CheckCircle2 className="h-3 w-3 text-success shrink-0" />;
  if (status === 'failed') return <XCircle className="h-3 w-3 text-destructive shrink-0" />;
  if (status === 'cancelled') return <StopCircle className="h-3 w-3 text-warning shrink-0" />;
  if (status === 'running' || status === 'queued') {
    return <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0 motion-reduce:animate-none" />;
  }
  if (status === 'skipped') return <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />;
  if (status === 'waiting') return <Clock className="h-3 w-3 text-chart-4 shrink-0" />;
  return <Clock className="h-3 w-3 text-muted-foreground shrink-0" />;
}

const statusBorder: Record<string, string> = {
  success: 'border-success/60 bg-success/5',
  failed: 'border-destructive/70 bg-destructive/5',
  running: 'border-primary/60 bg-primary/5',
  queued: 'border-primary/40 bg-primary/5',
  cancelled: 'border-warning/60 bg-warning/5',
  skipped: 'border-muted-foreground/30 bg-muted/30',
  waiting: 'border-chart-4/50 bg-chart-4/5',
  pending: 'border-border bg-background',
};

function GraphNode({
  node,
  compact,
  onSelect,
}: {
  node: GraphNodeView;
  compact?: boolean;
  onSelect: (node: GraphNodeView) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        statusBorder[node.status] || statusBorder.pending,
        compact ? 'text-[10px]' : 'text-xs',
      )}
    >
      <StatusIcon status={node.status} />
      <span className="truncate font-medium">{node.name}</span>
    </button>
  );
}

function Connector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="h-3 w-px bg-border" />
      {label && (
        <span className="my-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      <div className="h-3 w-px bg-border" />
    </div>
  );
}

function JobBranchColumn({
  branch,
  onSelectNode,
}: {
  branch: JobBranchView;
  onSelectNode: (node: GraphNodeView) => void;
}) {
  const branchStatusIcon = branch.status === 'success'
    ? 'text-success'
    : branch.status === 'failed'
      ? 'text-destructive'
      : 'text-muted-foreground';

  return (
    <div className="flex w-[120px] shrink-0 flex-col">
      <div className={cn('mb-1 flex items-center gap-1 text-[10px] font-semibold', branchStatusIcon)}>
        {branch.status === 'success' ? '✓' : branch.status === 'failed' ? '✗' : '○'}
        <span className="truncate" title={branch.label}>
          Job {branch.jobIndex}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {branch.nodes.map((node) => (
          <GraphNode key={node.key} node={node} compact onSelect={onSelectNode} />
        ))}
      </div>
    </div>
  );
}

interface ExecutionGraphProps {
  graph: ExecutionGraphView;
  onSelectNode: (node: GraphNodeView) => void;
}

export function ExecutionGraph({ graph, onSelectNode }: ExecutionGraphProps) {
  const [jobsExpanded, setJobsExpanded] = useState(graph.jobBranches.length <= 5);

  return (
    <div className="space-y-2">
      {graph.isLegacy && (
        <p className="text-xs text-muted-foreground">
          Legacy run — node names from the current workflow definition and execution logs. Per-job branch detail may be unavailable.
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mx-auto flex max-w-md flex-col items-stretch">
          {graph.commonNodes.map((node, i) => (
            <div key={node.key}>
              {i > 0 && <Connector />}
              <GraphNode node={node} onSelect={onSelectNode} />
            </div>
          ))}
        </div>

        {graph.jobBranches.length > 0 && (
          <>
            <Connector label="Fan out" />
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{graph.jobsTotal} Jobs</span>
              <span>·</span>
              <span className="text-success">{graph.jobsSuccessful} Successful</span>
              <span>·</span>
              <span className="text-destructive">{graph.jobsFailed} Failed</span>
              {graph.jobsSkipped > 0 && (
                <>
                  <span>·</span>
                  <span>{graph.jobsSkipped} Skipped</span>
                </>
              )}
            </div>

            {graph.jobBranches.length > 5 && (
              <Collapsible open={jobsExpanded} onOpenChange={setJobsExpanded}>
                <CollapsibleTrigger className="mb-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  {jobsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {jobsExpanded ? 'Collapse job branches' : `Expand ${graph.jobBranches.length} job branches`}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-x-auto pb-2">
                    <div className="flex min-w-min gap-3">
                      {graph.jobBranches.map((branch) => (
                        <JobBranchColumn key={branch.jobExecutionId} branch={branch} onSelectNode={onSelectNode} />
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {(graph.jobBranches.length <= 5 || jobsExpanded) && graph.jobBranches.length <= 5 && (
              <div className="overflow-x-auto pb-2 touch-pan-x">
                <div className="flex min-w-min gap-3">
                  {graph.jobBranches.map((branch) => (
                    <JobBranchColumn key={branch.jobExecutionId} branch={branch} onSelectNode={onSelectNode} />
                  ))}
                </div>
              </div>
            )}
            <Connector label="Fan in" />
          </>
        )}

        {graph.fanInNodes.length > 0 && (
          <div className="mx-auto flex max-w-md flex-col items-stretch">
            {graph.fanInNodes.map((node, i) => (
              <div key={node.key}>
                {i > 0 && <Connector />}
                <GraphNode node={node} onSelect={onSelectNode} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
