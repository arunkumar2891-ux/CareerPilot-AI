/**
 * Per-job graph nodes must not inherit sibling status from workflow_run_nodes
 * (that table is one row per workflow node, not per job).
 */
export function resolveScopedNodeStatus(input: {
  execStatus?: string;
  execCompletedAt?: string;
  sharedResultStatus?: string;
  runStatus?: string;
  currentNodeId?: string;
  workflowNodeId: string;
  jobExecutionId?: string;
  activeJobExecutionId?: string;
  jobStatus?: string;
}): string {
  const runFinished = Boolean(
    input.runStatus
    && input.runStatus !== 'running'
    && input.runStatus !== 'queued',
  );

  if (input.execStatus) {
    if (input.execStatus === 'running' && runFinished && !input.execCompletedAt) {
      return 'skipped';
    }
    return input.execStatus;
  }

  if (!input.jobExecutionId && input.sharedResultStatus) {
    return input.sharedResultStatus;
  }

  const isActiveJob = Boolean(
    input.jobExecutionId
    && input.activeJobExecutionId
    && input.jobExecutionId === input.activeJobExecutionId,
  );
  if (
    (input.runStatus === 'running' || input.runStatus === 'queued')
    && input.currentNodeId === input.workflowNodeId
    && (!input.jobExecutionId || isActiveJob)
  ) {
    return 'running';
  }

  if (runFinished && input.jobExecutionId && (input.jobStatus === 'pending' || !input.jobStatus)) {
    return 'skipped';
  }

  return 'pending';
}
