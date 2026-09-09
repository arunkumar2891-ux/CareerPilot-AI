import { resolveScopedNodeStatus } from '../../../../src/utils/job-branch-status.ts';

Deno.test('unstarted job 2 does not inherit job 1 failed node status', () => {
  const status = resolveScopedNodeStatus({
    sharedResultStatus: 'failed',
    runStatus: 'running',
    currentNodeId: 'gemini-node',
    workflowNodeId: 'gemini-node',
    jobExecutionId: 'job-2',
    activeJobExecutionId: 'job-1',
    jobStatus: 'pending',
  });
  if (status !== 'pending') {
    throw new Error(`expected pending, got ${status}`);
  }
});

Deno.test('job 1 keeps its own failed node execution', () => {
  const status = resolveScopedNodeStatus({
    execStatus: 'failed',
    sharedResultStatus: 'failed',
    runStatus: 'running',
    workflowNodeId: 'gemini-node',
    jobExecutionId: 'job-1',
    activeJobExecutionId: 'job-1',
    jobStatus: 'failed',
  });
  if (status !== 'failed') throw new Error(`expected failed, got ${status}`);
});

Deno.test('only the active job shows the current node as running', () => {
  const job1 = resolveScopedNodeStatus({
    runStatus: 'running',
    currentNodeId: 'gemini-node',
    workflowNodeId: 'gemini-node',
    jobExecutionId: 'job-1',
    activeJobExecutionId: 'job-1',
    jobStatus: 'running',
  });
  const job2 = resolveScopedNodeStatus({
    runStatus: 'running',
    currentNodeId: 'gemini-node',
    workflowNodeId: 'gemini-node',
    jobExecutionId: 'job-2',
    activeJobExecutionId: 'job-1',
    jobStatus: 'pending',
  });
  if (job1 !== 'running') throw new Error(`expected job 1 running, got ${job1}`);
  if (job2 !== 'pending') throw new Error(`expected job 2 pending, got ${job2}`);
});

Deno.test('unstarted job nodes become skipped when the run finishes', () => {
  const status = resolveScopedNodeStatus({
    sharedResultStatus: 'failed',
    runStatus: 'failed',
    workflowNodeId: 'gemini-node',
    jobExecutionId: 'job-2',
    jobStatus: 'pending',
  });
  if (status !== 'skipped') throw new Error(`expected skipped, got ${status}`);
});
