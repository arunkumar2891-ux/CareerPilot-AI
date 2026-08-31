import type { WorkflowRun, WorkflowRunStatus } from '@/types';

export interface ActiveExecutionStep {
  nodeId?: string;
  name: string;
  type?: string;
  detail?: string;
  startedAt: string;
}

export interface PipelineStepView {
  nodeId: string;
  name: string;
  status: WorkflowRunStatus | 'pending';
  duration: number;
}

export function getActiveExecutionStep(run: WorkflowRun): ActiveExecutionStep | null {
  if (run.status !== 'running' && run.status !== 'queued') return null;

  const sorted = [...run.logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const lastProcessing = sorted.filter((l) => /Processing item \d+\/\d+:/.test(l.message)).at(-1);
  const lastExecuting = sorted.filter((l) => l.message.startsWith('Executing node:')).at(-1);
  const lastCompleted = sorted.filter((l) => l.message.startsWith('Completed node:')).at(-1);
  const lastWaiting = sorted.filter((l) => l.message.startsWith('Waiting until')).at(-1);

  const anchor = lastProcessing || lastExecuting || lastWaiting;
  if (!anchor) {
    if (run.currentNodeId) {
      return {
        nodeId: run.currentNodeId,
        name: run.currentNodeId,
        startedAt: run.startedAt,
      };
    }
    return null;
  }

  if (lastCompleted && new Date(lastCompleted.timestamp) > new Date(anchor.timestamp)) {
    return {
      nodeId: lastCompleted.nodeId,
      name: lastCompleted.message.replace(/^Completed node:\s*/, '').split(' in ')[0] || 'Step',
      detail: 'Finishing up…',
      startedAt: lastCompleted.timestamp,
    };
  }

  const execMatch = anchor.message.match(/Executing node:\s*(.+?)\s*\(([^)]+)\)/);
  const procMatch = anchor.message.match(/Processing item (\d+)\/(\d+):\s*(.+)/);
  const jobPipelineMatch = anchor.message.match(/\[job (\d+)\/(\d+)\]/);
  const waitMatch = anchor.message.match(/Waiting until .+:\s*(.+)/);

  if (jobPipelineMatch && execMatch) {
    return {
      nodeId: anchor.nodeId,
      name: execMatch[1].trim(),
      type: execMatch[2],
      detail: `Job ${jobPipelineMatch[1]} of ${jobPipelineMatch[2]}`,
      startedAt: anchor.timestamp,
    };
  }

  if (procMatch) {
    return {
      nodeId: anchor.nodeId,
      name: procMatch[3].trim(),
      type: execMatch?.[2],
      detail: `Job ${procMatch[1]} of ${procMatch[2]}`,
      startedAt: anchor.timestamp,
    };
  }

  if (waitMatch) {
    return {
      nodeId: anchor.nodeId,
      name: waitMatch[1].trim(),
      detail: 'Waiting to retry',
      startedAt: anchor.timestamp,
    };
  }

  if (execMatch) {
    return {
      nodeId: anchor.nodeId,
      name: execMatch[1].trim(),
      type: execMatch[2].trim(),
      startedAt: anchor.timestamp,
    };
  }

  return {
    nodeId: anchor.nodeId,
    name: anchor.message,
    startedAt: anchor.timestamp,
  };
}

export function buildPipelineSteps(
  nodeNames: { id: string; name: string; positionX: number }[],
  nodeResults: WorkflowRun['nodeResults'],
  activeStep: ActiveExecutionStep | null,
): PipelineStepView[] {
  const sorted = [...nodeNames].sort((a, b) => a.positionX - b.positionX);
  const resultMap = new Map(nodeResults.map((n) => [n.nodeId, n]));
  const activeId = activeStep?.nodeId;
  let activeIndex = sorted.findIndex((n) => n.id === activeId);
  if (activeIndex < 0 && activeStep?.name) {
    activeIndex = sorted.findIndex((n) => n.name === activeStep.name);
  }

  return sorted.map((node, index) => {
    const result = resultMap.get(node.id);
    if (result) {
      return {
        nodeId: node.id,
        name: node.name,
        status: result.status,
        duration: result.duration,
      };
    }
    if (activeIndex >= 0 && index === activeIndex) {
      return { nodeId: node.id, name: node.name, status: 'running', duration: 0 };
    }
    if (activeIndex >= 0 && index > activeIndex) {
      return { nodeId: node.id, name: node.name, status: 'pending', duration: 0 };
    }
    return { nodeId: node.id, name: node.name, status: 'pending', duration: 0 };
  });
}
