import {
  buildJobDiscoveryRunSeed,
  formatUnknownError,
  isJobPipelineStart,
  jobRowToPipelineItem,
  loadExistingJobForPipeline,
  resolveLoadJobOutput,
  workflowHasLoadJobNode,
} from './job-discovery.ts';
import { shouldSaveWorkflowSnapshot } from './execution-persistence.ts';
import type { WorkflowNodeRow } from './types.ts';

function node(partial: Partial<WorkflowNodeRow> & { type: string; config?: Record<string, unknown> }): WorkflowNodeRow {
  return {
    id: partial.id || 'n1',
    workflow_id: 'wf',
    user_id: 'u1',
    node_key: partial.id || 'n1',
    type: partial.type,
    name: partial.name || partial.type,
    position_x: 0,
    position_y: 0,
    config: partial.config || {},
  };
}

Deno.test('isJobPipelineStart includes load_job', () => {
  if (!isJobPipelineStart(node({ type: 'supabase', config: { action: 'load_job' } }))) {
    throw new Error('load_job should start the per-job pipeline');
  }
});

Deno.test('isJobPipelineStart still matches insert_job (default and explicit)', () => {
  if (!isJobPipelineStart(node({ type: 'supabase', config: {} }))) {
    throw new Error('default supabase action should be insert_job');
  }
  if (!isJobPipelineStart(node({ type: 'supabase', config: { action: 'insert_job' } }))) {
    throw new Error('insert_job should start the per-job pipeline');
  }
  if (isJobPipelineStart(node({ type: 'gemini', config: {} }))) {
    throw new Error('gemini must not be a pipeline start');
  }
});

Deno.test('workflowHasLoadJobNode detects Resume Tailoring graphs', () => {
  const tailor = [
    node({ type: 'supabase', config: { action: 'load_job' } }),
    node({ type: 'gemini', id: 'n2' }),
  ];
  const daily = [
    node({ type: 'supabase', config: { action: 'insert_job' } }),
    node({ type: 'gemini', id: 'n2' }),
  ];
  if (!workflowHasLoadJobNode(tailor)) throw new Error('tailor graph should require a job');
  if (workflowHasLoadJobNode(daily)) throw new Error('daily graph should not require a job id');
});

Deno.test('jobRowToPipelineItem maps role and description without inserting', () => {
  const item = jobRowToPipelineItem({
    id: 'job-1',
    company: 'Acme',
    role: 'Solutions Engineer',
    description: 'Build integrations',
  });
  if (item.jobId !== 'job-1') throw new Error(`expected jobId job-1, got ${item.jobId}`);
  if (item.title !== 'Solutions Engineer') throw new Error(String(item.title));
  if (item.jobDescription !== 'Build integrations') throw new Error(String(item.jobDescription));
});

Deno.test('buildJobDiscoveryRunSeed stores one pending job and job_discovery trigger', () => {
  const seed = buildJobDiscoveryRunSeed({
    id: 'job-9',
    company: 'Acme',
    role: 'AI Engineer',
    description: 'Ship GenAI',
  });
  if (seed.triggerType !== 'job_discovery') throw new Error(seed.triggerType);
  if (seed.context.variables.targetJobId !== 'job-9') {
    throw new Error(seed.context.variables.targetJobId);
  }
  if (seed.context.variables.pendingJobItems.length !== 1) {
    throw new Error(`expected 1 pending item, got ${seed.context.variables.pendingJobItems.length}`);
  }
  if (seed.context.variables.pendingJobItems[0].jobId !== 'job-9') {
    throw new Error('pending item must carry jobId');
  }
});

Deno.test('loadExistingJobForPipeline does not insert a jobs row', async () => {
  const calls: string[] = [];
  const item = await loadExistingJobForPipeline(
    {
      findOwned: async (jobId, userId) => {
        calls.push(`find:${jobId}:${userId}`);
        return {
          id: jobId,
          company: 'Acme',
          role: 'Cloud Architect',
          description: 'Platforms',
        };
      },
      markGenerating: async (jobId) => {
        calls.push(`generating:${jobId}`);
      },
      insert: async () => {
        calls.push('insert');
        throw new Error('load_job must not insert');
      },
    },
    'user-1',
    'job-2',
  );
  if (calls.includes('insert')) throw new Error('load_job inserted a job');
  if (!calls.includes('find:job-2:user-1')) throw new Error('should load the owned job');
  if (!calls.includes('generating:job-2')) throw new Error('should mark resume generating');
  if (item.jobId !== 'job-2') throw new Error(String(item.jobId));
});

Deno.test('loadExistingJobForPipeline does not fail when marking generating throws', async () => {
  const item = await loadExistingJobForPipeline(
    {
      findOwned: async (jobId) => ({
        id: jobId,
        company: 'Acme',
        role: 'AI Engineer',
        description: 'GenAI',
      }),
      markGenerating: async () => {
        throw { message: 'new row violates check constraint', code: '23514' };
      },
    },
    'user-1',
    'job-3',
  );
  if (item.jobId !== 'job-3') throw new Error(String(item.jobId));
});

Deno.test('formatUnknownError reads PostgREST error objects instead of [object Object]', () => {
  const message = formatUnknownError({
    code: '23514',
    details: null,
    hint: null,
    message: 'new row for relation "jobs" violates check constraint',
  });
  if (message === '[object Object]') throw new Error('must not stringify as [object Object]');
  if (!message.includes('check constraint')) throw new Error(message);
});

Deno.test('resolveLoadJobOutput falls back to the seeded job item', () => {
  const item = resolveLoadJobOutput(null, {
    jobId: 'job-4',
    company: 'Acme',
    role: 'FDE',
    description: 'Ship with customers',
  });
  if (item.jobId !== 'job-4') throw new Error(String(item.jobId));
  if (item.title !== 'FDE') throw new Error(String(item.title));
});

Deno.test('shouldSaveWorkflowSnapshot is true when a pre-created run has none', () => {
  if (!shouldSaveWorkflowSnapshot(null)) throw new Error('null snapshot should be saved');
  if (!shouldSaveWorkflowSnapshot(undefined)) throw new Error('missing snapshot should be saved');
  if (shouldSaveWorkflowSnapshot({ workflowName: 'Resume Tailoring', nodes: [] })) {
    throw new Error('existing snapshot must not be overwritten');
  }
});
