import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { services } from '@/services';
import {
  groupJobsByStatus,
  isRedundantMove,
  jobMoveWarning,
  jobStatusLabel,
  withJobStatus,
} from '@/utils/job-kanban';
import type { Job, JobStatus } from '@/types';

/** MIME type for the drag payload. A custom type stops foreign drags from being accepted. */
const DRAG_TYPE = 'application/x-careerpilot-job';

interface JobKanbanBoardProps {
  jobs: Job[];
  /**
   * The parent owns card rendering so the board stays a pure layout + DnD
   * concern. `dragging` lets the card dim itself; `onMoveTo` powers the
   * keyboard-accessible "Move to" menu.
   */
  renderCard: (args: {
    job: Job;
    dragging: boolean;
    onMoveTo: (status: JobStatus) => void;
  }) => React.ReactNode;
}

export function JobKanbanBoard({ jobs, renderCard }: JobKanbanBoardProps) {
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<JobStatus | null>(null);
  // Depth counter per column: dragenter/dragleave also fire for child elements,
  // so a naive boolean flickers as the pointer crosses each card.
  const enterDepth = useRef(new Map<string, number>());

  const { columns, unfiled } = groupJobsByStatus(jobs);

  const moveJob = useCallback(async (job: Job, to: JobStatus) => {
    if (isRedundantMove(job, to)) return;
    const from = job.status;
    const key = ['jobs'];

    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<Job[]>(key);
    // Optimistic: the card must follow the cursor instantly.
    qc.setQueryData<Job[]>(key, (old) => (old ? withJobStatus(old, job.id, to) : old));

    try {
      await services.jobSearch.updateStatus(job.id, to);
      const warning = jobMoveWarning(job, to);
      toast.success(`${job.company} → ${jobStatusLabel(to)}`, {
        description: warning ?? undefined,
        action: {
          label: 'Undo',
          onClick: () => { void moveJob({ ...job, status: to }, from); },
        },
      });
      // Metrics and the applications view derive from job status.
      void qc.invalidateQueries({ queryKey: ['metrics'] });
    } catch (err) {
      if (previous) qc.setQueryData<Job[]>(key, previous);
      else void qc.invalidateQueries({ queryKey: key });
      toast.error(
        err instanceof Error ? err.message : `Could not move ${job.company} to ${jobStatusLabel(to)}`,
      );
    }
  }, [qc]);

  const jobById = useCallback(
    (id: string) => jobs.find((j) => j.id === id),
    [jobs],
  );

  const setDepth = (status: string, next: number) => {
    if (next <= 0) enterDepth.current.delete(status);
    else enterDepth.current.set(status, next);
  };

  const columnHandlers = (status: JobStatus) => ({
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      const depth = (enterDepth.current.get(status) ?? 0) + 1;
      setDepth(status, depth);
      setDropTarget(status);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      // Without preventDefault the browser refuses the drop outright.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      const depth = (enterDepth.current.get(status) ?? 0) - 1;
      setDepth(status, depth);
      if (depth <= 0) setDropTarget((current) => (current === status ? null : current));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDepth(status, 0);
      setDropTarget(null);
      setDraggingId(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      const job = id ? jobById(id) : undefined;
      if (job) void moveJob(job, status);
    },
  });

  const cardHandlers = (job: Job) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, job.id);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(job.id);
    },
    onDragEnd: () => {
      setDraggingId(null);
      setDropTarget(null);
      enterDepth.current.clear();
    },
  });

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
      {columns.map(({ column, jobs: colJobs }) => {
        const isTarget = dropTarget === column.status;
        return (
          <section
            key={column.status}
            aria-label={`${column.label}, ${colJobs.length} job${colJobs.length === 1 ? '' : 's'}`}
            className="w-72 shrink-0"
            {...columnHandlers(column.status)}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">{column.label}</h3>
              <Badge variant="secondary">{colJobs.length}</Badge>
            </div>
            <ScrollArea className="h-[calc(100vh-340px)]">
              <div
                className={`min-h-[120px] space-y-2 rounded-lg pr-2 transition-colors ${
                  isTarget ? 'bg-primary/5 outline-dashed outline-2 outline-offset-2 outline-primary/40' : ''
                }`}
              >
                {colJobs.map((job) => (
                  <div key={job.id} {...cardHandlers(job)}>
                    {renderCard({
                      job,
                      dragging: draggingId === job.id,
                      onMoveTo: (status) => { void moveJob(job, status); },
                    })}
                  </div>
                ))}
                {colJobs.length === 0 && (
                  <p className={`rounded-lg border border-dashed px-3 py-6 text-center text-xs ${
                    isTarget ? 'border-primary/40 text-primary' : 'text-muted-foreground'
                  }`}>
                    {isTarget ? `Drop to mark as ${column.label}` : column.hint}
                  </p>
                )}
              </div>
            </ScrollArea>
          </section>
        );
      })}

      {unfiled.length > 0 && (
        <section aria-label={`Other, ${unfiled.length} jobs`} className="w-72 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Other</h3>
            <Badge variant="secondary">{unfiled.length}</Badge>
          </div>
          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="space-y-2 pr-2">
              {unfiled.map((job) => (
                <div key={job.id} {...cardHandlers(job)}>
                  {renderCard({
                    job,
                    dragging: draggingId === job.id,
                    onMoveTo: (status) => { void moveJob(job, status); },
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>
        </section>
      )}
    </div>
  );
}

export type { JobKanbanBoardProps };
