export function formatUnknownError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object') {
    const row = err as Record<string, unknown>;
    for (const key of ['message', 'error', 'details', 'hint']) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (value && typeof value === 'object') {
        const nested = (value as Record<string, unknown>).message;
        if (typeof nested === 'string' && nested.trim()) return nested;
      }
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}' && json !== 'null') return json;
    } catch {
      /* ignore */
    }
  }
  const fallback = String(err);
  return fallback === '[object Object]' ? 'Unknown error' : fallback;
}

export function workflowHasLoadJobNode(
  nodes: Array<{ type: string; config?: Record<string, unknown> }>,
): boolean {
  return nodes.some((n) => n.type === 'supabase' && (n.config?.action as string) === 'load_job');
}

export function isJobPipelineStart(node: { type: string; config?: Record<string, unknown> }): boolean {
  if (node.type !== 'supabase') return false;
  const action = (node.config?.action as string) || 'insert_job';
  return action === 'insert_job' || action === 'load_job';
}

export function jobRowToPipelineItem(row: Record<string, unknown>): Record<string, unknown> {
  const id = String(row.jobId || row.id || '').trim();
  const company = String(row.company ?? row.companyName ?? '');
  const role = String(row.role ?? row.title ?? '');
  const description = String(row.description ?? row.jobDescription ?? '');
  return {
    ...row,
    id,
    jobId: id,
    company,
    companyName: company,
    role,
    title: role,
    description,
    jobDescription: description,
  };
}

export function resolvePipelineJobId(input: unknown, targetJobId?: unknown): string {
  if (input && typeof input === 'object') {
    const row = input as Record<string, unknown>;
    const fromInput = String(row.jobId || row.id || '').trim();
    if (fromInput) return fromInput;
  }
  return String(targetJobId ?? '').trim();
}

export function buildJobDiscoveryRunSeed(job: Record<string, unknown>): {
  triggerType: 'job_discovery';
  context: {
    variables: { targetJobId: string; pendingJobItems: Record<string, unknown>[] };
    nodeOutputs: Record<string, unknown>;
  };
} {
  const item = jobRowToPipelineItem(job);
  return {
    triggerType: 'job_discovery',
    context: {
      variables: {
        targetJobId: String(item.jobId),
        pendingJobItems: [item],
      },
      nodeOutputs: {},
    },
  };
}

export interface JobLookup {
  findOwned: (jobId: string, userId: string) => Promise<Record<string, unknown> | null>;
  markGenerating: (jobId: string, userId: string) => Promise<void>;
  insert?: (row: Record<string, unknown>) => Promise<unknown>;
}

export async function loadExistingJobForPipeline(
  jobs: JobLookup,
  userId: string,
  jobId: string,
): Promise<Record<string, unknown>> {
  const id = jobId.trim();
  if (!id) throw new Error('Job id is required');
  const row = await jobs.findOwned(id, userId);
  if (!row) throw new Error('Job not found');
  try {
    await jobs.markGenerating(id, userId);
  } catch {
    // resume_status is optional; a failed update must not abort tailoring
  }
  return jobRowToPipelineItem(row);
}

/** Use the seeded Job Discovery item when the DB reload is unavailable. */
export function resolveLoadJobOutput(
  loaded: Record<string, unknown> | null,
  input: unknown,
  targetJobId?: unknown,
): Record<string, unknown> {
  if (loaded?.jobId) return loaded;
  if (input && typeof input === 'object') {
    const fallback = jobRowToPipelineItem(input as Record<string, unknown>);
    if (fallback.jobId) return fallback;
  }
  const id = resolvePipelineJobId(input, targetJobId);
  if (id) return jobRowToPipelineItem({ id });
  throw new Error('Job id is required');
}
