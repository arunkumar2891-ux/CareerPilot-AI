import { useEffect, useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, AlertCircle, StopCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { InlineLoader } from '@/components/motion';
import { cn } from '@/lib/utils';
import type { GraphNodeView, JobBranchView, ExecutionGraphView, RoleGroupView } from '@/utils/execution-graph';
import type { WorkflowRunStatus } from '@/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function StatusIcon({ status }: { status: WorkflowRunStatus | 'pending' }) {
  if (status === 'success') return <CheckCircle2 className="h-3 w-3 text-success shrink-0" />;
  if (status === 'failed') return <XCircle className="h-3 w-3 text-destructive shrink-0" />;
  if (status === 'cancelled') return <StopCircle className="h-3 w-3 text-warning shrink-0" />;
  if (status === 'running' || status === 'queued') {
    return <InlineLoader className="!h-3 !w-3 text-primary shrink-0" />;
  }
  if (status === 'skipped') return <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />;
  if (status === 'waiting') return <Clock className="h-3 w-3 text-chart-4 shrink-0" />;
  return <Clock className="h-3 w-3 text-muted-foreground shrink-0" />;
}

const statusBorder: Record<string, string> = {
  success: 'border-success/60 bg-success/5',
  failed: 'border-destructive/70 bg-destructive/5',
  running: 'border-primary/60 bg-primary/5 glow-border animate-status-pulse',
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

function NodeColumn({
  nodes,
  onSelectNode,
}: {
  nodes: GraphNodeView[];
  onSelectNode: (node: GraphNodeView) => void;
}) {
  if (!nodes.length) return null;
  return (
    <div className="mx-auto flex max-w-md flex-col items-stretch">
      {nodes.map((node, i) => (
        <div key={node.key}>
          {i > 0 && <Connector />}
          <GraphNode node={node} onSelect={onSelectNode} />
        </div>
      ))}
    </div>
  );
}

function JobBranchColumn({
  branch,
  displayIndex,
  onSelectNode,
}: {
  branch: JobBranchView;
  displayIndex?: number;
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
          Job {displayIndex ?? branch.jobIndex}
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

function JobFanOut({
  branches,
  jobsTotal,
  jobsSuccessful,
  jobsFailed,
  jobsSkipped,
  onSelectNode,
}: {
  branches: JobBranchView[];
  jobsTotal: number;
  jobsSuccessful: number;
  jobsFailed: number;
  jobsSkipped: number;
  onSelectNode: (node: GraphNodeView) => void;
}) {
  const [jobsExpanded, setJobsExpanded] = useState(branches.length <= 5);
  if (!branches.length) return null;

  return (
    <>
      <Connector label="Fan out" />
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{jobsTotal} Jobs</span>
        <span>·</span>
        <span className="text-success">{jobsSuccessful} Successful</span>
        <span>·</span>
        <span className="text-destructive">{jobsFailed} Failed</span>
        {jobsSkipped > 0 && (
          <>
            <span>·</span>
            <span>{jobsSkipped} Skipped</span>
          </>
        )}
      </div>

      {branches.length > 5 && (
        <Collapsible open={jobsExpanded} onOpenChange={setJobsExpanded}>
          <CollapsibleTrigger className="mb-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {jobsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {jobsExpanded ? 'Collapse job branches' : `Expand ${branches.length} job branches`}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-min gap-3">
                {branches.map((branch, index) => (
                  <JobBranchColumn
                    key={branch.jobExecutionId}
                    branch={branch}
                    displayIndex={index + 1}
                    onSelectNode={onSelectNode}
                  />
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {(branches.length <= 5 || jobsExpanded) && branches.length <= 5 && (
        <div className="overflow-x-auto pb-2 touch-pan-x">
          <div className="flex min-w-min gap-3">
            {branches.map((branch, index) => (
              <JobBranchColumn
                key={branch.jobExecutionId}
                branch={branch}
                displayIndex={index + 1}
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        </div>
      )}
      <Connector label="Fan in" />
    </>
  );
}

function RoleGroup({
  group,
  expanded,
  onToggle,
  onSelectNode,
}: {
  group: RoleGroupView;
  expanded: boolean;
  onToggle: () => void;
  onSelectNode: (node: GraphNodeView) => void;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          statusBorder[group.status] || statusBorder.pending,
        )}
      >
        <StatusIcon status={group.status} />
        <span className="min-w-0 flex-1 truncate font-semibold">Role: {group.role}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {group.jobsSuccessful}/{group.jobsTotal} successful
          {group.jobsFailed > 0 ? ` · ${group.jobsFailed} failed` : ''}
          {group.jobsSkipped > 0 ? ` · ${group.jobsSkipped} skipped` : ''}
        </span>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
      </button>
      {expanded && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
          <NodeColumn nodes={group.commonNodes} onSelectNode={onSelectNode} />
          <JobFanOut
            branches={group.jobBranches}
            jobsTotal={group.jobsTotal}
            jobsSuccessful={group.jobsSuccessful}
            jobsFailed={group.jobsFailed}
            jobsSkipped={group.jobsSkipped}
            onSelectNode={onSelectNode}
          />
        </div>
      )}
    </div>
  );
}

interface ExecutionGraphProps {
  graph: ExecutionGraphView;
  onSelectNode: (node: GraphNodeView) => void;
}

const EMPTY_ROLE_GROUPS: RoleGroupView[] = [];

export function ExecutionGraph({ graph, onSelectNode }: ExecutionGraphProps) {
  const roleGroups = graph.roleGroups ?? EMPTY_ROLE_GROUPS;
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(
    () => new Set(roleGroups.filter((group) => group.status === 'running' || group.status === 'queued').map((group) => group.role)),
  );

  useEffect(() => {
    const running = (graph.roleGroups || [])
      .filter((group) => group.status === 'running' || group.status === 'queued')
      .map((group) => group.role);
    if (!running.length) return;
    setExpandedRoles((current) => {
      const next = new Set(current);
      let changed = false;
      for (const role of running) {
        if (!next.has(role)) {
          next.add(role);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [graph.roleGroups]);

  const toggleRole = (role: string) => {
    setExpandedRoles((current) => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {graph.isLegacy && (
        <p className="text-xs text-muted-foreground">
          Legacy run — node names from the current workflow definition and execution logs. Per-job branch detail may be unavailable.
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <NodeColumn nodes={graph.commonNodes} onSelectNode={onSelectNode} />

        {roleGroups.length > 0 ? (
          <div className="mt-2 space-y-3">
            {graph.commonNodes.length > 0 && <Connector label="Roles" />}
            {roleGroups.map((group) => (
              <RoleGroup
                key={group.role}
                group={group}
                expanded={expandedRoles.has(group.role)}
                onToggle={() => toggleRole(group.role)}
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        ) : (
          <JobFanOut
            branches={graph.jobBranches}
            jobsTotal={graph.jobsTotal}
            jobsSuccessful={graph.jobsSuccessful}
            jobsFailed={graph.jobsFailed}
            jobsSkipped={graph.jobsSkipped}
            onSelectNode={onSelectNode}
          />
        )}

        {graph.fanInNodes.length > 0 && (
          <div className="mt-2">
            {roleGroups.length > 0 && <Connector />}
            <NodeColumn nodes={graph.fanInNodes} onSelectNode={onSelectNode} />
          </div>
        )}
      </div>
    </div>
  );
}
