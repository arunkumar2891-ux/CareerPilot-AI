export type WorkflowRunStatus = 'idle' | 'running' | 'success' | 'failed' | 'paused' | 'queued';

export interface WorkflowNodeRow {
  id: string;
  workflow_id: string;
  user_id: string;
  node_key: string;
  type: string;
  name: string;
  position_x: number;
  position_y: number;
  config: Record<string, unknown>;
}

export interface WorkflowEdgeRow {
  id: string;
  workflow_id: string;
  source_id: string;
  target_id: string;
  label?: string;
}

export interface NodeResult {
  output: unknown;
  status: 'success' | 'failed' | 'waiting';
  resumeAt?: Date;
  route?: string;
  error?: string;
}

export interface RunContext {
  runId: string;
  workflowId: string;
  userId: string;
  variables: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  settings: Record<string, unknown>;
  currentNodeId?: string;
  itemIndex?: number;
  items?: unknown[];
}

export interface NodeExecutor {
  execute(
    ctx: RunContext,
    node: WorkflowNodeRow,
    input: unknown,
    edges: WorkflowEdgeRow[],
  ): Promise<NodeResult>;
}

export type SupabaseAdmin = ReturnType<typeof import('../supabase-admin.ts').createAdminClient>;
