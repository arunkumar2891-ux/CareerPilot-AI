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
  await jobs.markGenerating(id, userId);
  return jobRowToPipelineItem(row);
}
