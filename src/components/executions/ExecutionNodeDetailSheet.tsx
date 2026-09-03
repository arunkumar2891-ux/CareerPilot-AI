import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDurationMs } from '@/utils';
import { filterLogsForNode } from '@/utils/execution-graph';
import type { GraphNodeView } from '@/utils/execution-graph';
import type { WorkflowRun, WorkflowRunDetail } from '@/types';

interface ExecutionNodeDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: GraphNodeView | null;
  run: WorkflowRunDetail | WorkflowRun;
}

export function ExecutionNodeDetailSheet({
  open,
  onOpenChange,
  node,
  run,
}: ExecutionNodeDetailSheetProps) {
  if (!node) return null;

  const logs = filterLogsForNode(run.logs, node);
  const relatedAttempts = 'nodeExecutions' in run
    ? run.nodeExecutions.filter(
        (n) => n.workflowNodeId === node.workflowNodeId
          && (node.jobIndex == null || n.jobIndex === node.jobIndex),
      ).sort((a, b) => a.attempt - b.attempt)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-left">{node.name}</SheetTitle>
          <SheetDescription className="text-left">
            {node.jobIndex != null ? `Job ${node.jobIndex}` : 'Common step'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={node.status} />
            </div>
            <p><span className="text-muted-foreground">Run ID:</span> <span className="font-mono text-xs">{run.id}</span></p>
            {node.jobIndex != null && (
              <p><span className="text-muted-foreground">Job:</span> Job {node.jobIndex}</p>
            )}
            {node.attempt != null && (
              <p><span className="text-muted-foreground">Attempt:</span> {node.attempt}</p>
            )}
            {node.startedAt && (
              <p><span className="text-muted-foreground">Started:</span> {new Date(node.startedAt).toLocaleString()}</p>
            )}
            {node.completedAt && (
              <p><span className="text-muted-foreground">Completed:</span> {new Date(node.completedAt).toLocaleString()}</p>
            )}
            {node.durationMs != null && node.durationMs > 0 && (
              <p><span className="text-muted-foreground">Duration:</span> {formatDurationMs(node.durationMs)}</p>
            )}
            {node.errorType && (
              <p><span className="text-muted-foreground">Error Type:</span> {node.errorType}</p>
            )}
            {node.errorCode && (
              <p><span className="text-muted-foreground">Error Code:</span> {node.errorCode}</p>
            )}
            {node.errorMessage && (
              <p className="text-destructive"><span className="text-muted-foreground">Message:</span> {node.errorMessage}</p>
            )}
          </div>

          {relatedAttempts.length > 1 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attempt history</p>
              <ul className="space-y-1 text-xs">
                {relatedAttempts.map((attempt) => (
                  <li key={attempt.id} className="flex items-center gap-2">
                    <StatusBadge status={attempt.status} />
                    <span>Attempt {attempt.attempt}</span>
                    {attempt.errorMessage && (
                      <span className="truncate text-destructive">{attempt.errorMessage}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex-1 min-h-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logs</p>
            <ScrollArea className="h-[280px] rounded-lg border border-border bg-muted/30 p-3">
              <div className="font-mono text-xs space-y-1">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">No logs for this node execution.</p>
                ) : logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={
                      log.level === 'error' ? 'text-destructive'
                        : log.level === 'warn' ? 'text-warning'
                        : ''
                    }>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
