import { classifyExecutionError } from './execution-status.ts';
import type { WorkflowEdgeRow, WorkflowNodeRow } from './types.ts';
import type { createAdminClient } from '../supabase-admin.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface WorkflowSnapshot {
  workflowId: string;
  workflowName: string;
  nodes: {
    id: string;
    name: string;
    type: string;
    positionX: number;
    positionY: number;
    config: Record<string, unknown>;
  }[];
  edges: { id: string; sourceId: string; targetId: string; label?: string }[];
  capturedAt: string;
}

export interface JobExecutionRow {
  id: string;
  run_id: string;
  job_index: number;
  job_id?: string | null;
  label?: string | null;
  status: string;
  attempt: number;
  failed_node_id?: string | null;
  checkpoint_data?: unknown;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  error_type?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

export interface NodeExecutionRow {
  id: string;
  run_id: string;
  job_execution_id?: string | null;
  workflow_node_id: string;
  node_name: string;
  node_type: string;
  job_index?: number | null;
  attempt: number;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  error_type?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  output_summary?: unknown;
}

function summarizeOutput(output: unknown): Record<string, unknown> | null {
  if (output == null) return null;
  if (typeof output !== 'object') return { value: String(output).slice(0, 500) };
  const row = output as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of ['company', 'title', 'role', 'jobId', 'pdfLink', 'pdf_url', 'id', 'skipped']) {
    if (row[key] != null) summary[key] = row[key];
  }
  if (Object.keys(summary).length === 0) {
    return { preview: JSON.stringify(output).slice(0, 500) };
  }
  return summary;
}

export async function saveWorkflowSnapshot(
  admin: AdminClient,
  runId: string,
  workflowId: string,
  workflowName: string,
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
): Promise<void> {
  const snapshot: WorkflowSnapshot = {
    workflowId,
    workflowName,
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      positionX: n.position_x,
      positionY: n.position_y,
      config: n.config,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sourceId: e.source_id,
      targetId: e.target_id,
      label: e.label,
    })),
    capturedAt: new Date().toISOString(),
  };
  await admin.from('workflow_runs').update({ workflow_snapshot: snapshot }).eq('id', runId);
}

export async function initializeJobExecutions(
  admin: AdminClient,
  runId: string,
  userId: string,
  items: unknown[],
): Promise<JobExecutionRow[]> {
  const rows = items.map((item, idx) => ({
    run_id: runId,
    user_id: userId,
    job_index: idx + 1,
    label: jobLabelFromInput(idx + 1, item),
    status: 'pending',
    attempt: 1,
    input_snapshot: item,
  }));

  const { data, error } = await admin
    .from('workflow_job_executions')
    .insert(rows)
    .select('*');
  if (error && !String(error.message).includes('duplicate')) throw error;

  const { data: existing } = await admin
    .from('workflow_job_executions')
    .select('*')
    .eq('run_id', runId)
    .eq('attempt', 1)
    .order('job_index', { ascending: true });

  await admin.from('workflow_runs').update({
    jobs_total: items.length,
    jobs_successful: 0,
    jobs_failed: 0,
    jobs_skipped: 0,
  }).eq('id', runId);

  return (existing || data || []) as JobExecutionRow[];
}

function jobLabelFromInput(jobIndex: number, input: unknown): string {
  if (input && typeof input === 'object') {
    const row = input as Record<string, unknown>;
    const company = String(row.company ?? row.companyName ?? '').trim();
    const role = String(row.title ?? row.role ?? '').trim();
    if (company && role) return `Job ${jobIndex}: ${company} — ${role}`;
    if (company) return `Job ${jobIndex}: ${company}`;
    if (role) return `Job ${jobIndex}: ${role}`;
  }
  return `Job ${jobIndex}`;
}

export async function getJobExecutionForAttempt(
  admin: AdminClient,
  runId: string,
  jobIndex: number,
  attempt: number,
): Promise<JobExecutionRow | null> {
  const { data } = await admin
    .from('workflow_job_executions')
    .select('*')
    .eq('run_id', runId)
    .eq('job_index', jobIndex)
    .eq('attempt', attempt)
    .maybeSingle();
  return data as JobExecutionRow | null;
}

export async function startJobExecution(
  admin: AdminClient,
  jobExecutionId: string,
): Promise<void> {
  await admin.from('workflow_job_executions').update({
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', jobExecutionId);
}

export async function completeJobExecution(
  admin: AdminClient,
  runId: string,
  jobExecutionId: string,
  status: 'success' | 'failed' | 'skipped' | 'cancelled',
  opts: {
    jobId?: string;
    failedNodeId?: string;
    checkpointData?: unknown;
    errorMessage?: string;
    startedAt?: string;
  } = {},
): Promise<void> {
  const completedAt = new Date().toISOString();
  const startedAt = opts.startedAt ? new Date(opts.startedAt).getTime() : Date.now();
  const durationMs = Date.now() - startedAt;
  const err = opts.errorMessage ? classifyExecutionError(opts.errorMessage) : null;

  await admin.from('workflow_job_executions').update({
    status,
    job_id: opts.jobId ?? undefined,
    failed_node_id: opts.failedNodeId ?? null,
    checkpoint_data: opts.checkpointData ?? null,
    completed_at: completedAt,
    duration_ms: durationMs,
    error_type: err?.errorType ?? null,
    error_code: err?.errorCode ?? null,
    error_message: err?.sanitizedMessage ?? null,
    updated_at: completedAt,
  }).eq('id', jobExecutionId);

  await refreshRunJobCounters(admin, runId);
}

export async function refreshRunJobCounters(admin: AdminClient, runId: string): Promise<void> {
  const { data: jobs } = await admin
    .from('workflow_job_executions')
    .select('job_index, status, attempt')
    .eq('run_id', runId);

  if (!jobs?.length) return;

  const latestByIndex = new Map<number, { status: string; attempt: number }>();
  for (const row of jobs) {
    const jobIndex = row.job_index as number;
    const attempt = row.attempt as number;
    const existing = latestByIndex.get(jobIndex);
    if (!existing || attempt > existing.attempt) {
      latestByIndex.set(jobIndex, { status: row.status as string, attempt });
    }
  }

  let successful = 0;
  let failed = 0;
  let skipped = 0;
  for (const { status } of latestByIndex.values()) {
    if (status === 'success') successful++;
    else if (status === 'failed') failed++;
    else if (status === 'skipped') skipped++;
  }
  const total = latestByIndex.size;

  await admin.from('workflow_runs').update({
    jobs_total: total,
    jobs_successful: successful,
    jobs_failed: failed,
    jobs_skipped: skipped,
  }).eq('id', runId);
}

export async function startNodeExecution(
  admin: AdminClient,
  params: {
    runId: string;
    userId: string;
    workflowNodeId: string;
    nodeName: string;
    nodeType: string;
    jobExecutionId?: string | null;
    jobIndex?: number | null;
    attempt?: number;
  },
): Promise<string> {
  const { data, error } = await admin.from('workflow_node_executions').insert({
    run_id: params.runId,
    user_id: params.userId,
    job_execution_id: params.jobExecutionId ?? null,
    workflow_node_id: params.workflowNodeId,
    node_name: params.nodeName,
    node_type: params.nodeType,
    job_index: params.jobIndex ?? null,
    attempt: params.attempt ?? 1,
    status: 'running',
    started_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function completeNodeExecution(
  admin: AdminClient,
  nodeExecutionId: string,
  status: 'success' | 'failed' | 'skipped' | 'waiting' | 'cancelled',
  opts: {
    durationMs: number;
    output?: unknown;
    errorMessage?: string;
  },
): Promise<void> {
  const err = opts.errorMessage ? classifyExecutionError(opts.errorMessage) : null;
  await admin.from('workflow_node_executions').update({
    status,
    completed_at: new Date().toISOString(),
    duration_ms: opts.durationMs,
    output_summary: summarizeOutput(opts.output),
    error_type: err?.errorType ?? null,
    error_code: err?.errorCode ?? null,
    error_message: err?.sanitizedMessage ?? null,
  }).eq('id', nodeExecutionId);
}

export async function skipRemainingJobNodes(
  admin: AdminClient,
  runId: string,
  jobExecutionId: string,
  jobIndex: number,
  attempt: number,
  chainNodes: WorkflowNodeRow[],
  fromNodeId: string,
  userId: string,
): Promise<void> {
  const startIdx = chainNodes.findIndex((n) => n.id === fromNodeId);
  if (startIdx < 0) return;
  for (let i = startIdx + 1; i < chainNodes.length; i++) {
    const node = chainNodes[i];
    await admin.from('workflow_node_executions').insert({
      run_id: runId,
      user_id: userId,
      job_execution_id: jobExecutionId,
      workflow_node_id: node.id,
      node_name: node.name,
      node_type: node.type,
      job_index: jobIndex,
      attempt,
      status: 'skipped',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 0,
    });
  }
}

export interface StructuredLogParams {
  runId: string;
  userId: string;
  nodeId: string;
  level: string;
  message: string;
  jobExecutionId?: string | null;
  nodeExecutionId?: string | null;
  jobIndex?: number | null;
  attempt?: number | null;
  metadata?: Record<string, unknown>;
}

export async function insertStructuredLog(
  admin: AdminClient,
  params: StructuredLogParams,
): Promise<void> {
  await admin.from('workflow_logs').insert({
    run_id: params.runId,
    user_id: params.userId,
    node_id: params.nodeId,
    level: params.level,
    message: params.message,
    timestamp: new Date().toISOString(),
    job_execution_id: params.jobExecutionId ?? null,
    node_execution_id: params.nodeExecutionId ?? null,
    job_index: params.jobIndex ?? null,
    attempt: params.attempt ?? null,
    metadata: params.metadata ?? null,
  });
}

export async function createRetryAttempts(
  admin: AdminClient,
  runId: string,
  userId: string,
): Promise<JobExecutionRow[]> {
  const { data: failed } = await admin
    .from('workflow_job_executions')
    .select('*')
    .eq('run_id', runId)
    .eq('status', 'failed')
    .order('job_index', { ascending: true })
    .order('attempt', { ascending: false });

  if (!failed?.length) return [];

  const latestFailed = new Map<number, JobExecutionRow>();
  for (const row of failed) {
    const r = row as JobExecutionRow;
    if (!latestFailed.has(r.job_index)) latestFailed.set(r.job_index, r);
  }

  const newAttempts: JobExecutionRow[] = [];
  for (const prev of latestFailed.values()) {
    const nextAttempt = (prev.attempt || 1) + 1;
    const { data, error } = await admin.from('workflow_job_executions').insert({
      run_id: runId,
      user_id: userId,
      job_index: prev.job_index,
      job_id: prev.job_id,
      label: prev.label,
      status: 'pending',
      attempt: nextAttempt,
      input_snapshot: prev.input_snapshot ?? prev.checkpoint_data,
      checkpoint_data: prev.checkpoint_data,
      failed_node_id: prev.failed_node_id,
    }).select('*').single();
    if (error) throw error;
    newAttempts.push(data as JobExecutionRow);
  }

  await admin.from('workflow_runs').update({
    status: 'running',
    finished_at: null,
    error_message: null,
  }).eq('id', runId);

  return newAttempts;
}

export function latestJobAttempts(jobs: JobExecutionRow[]): JobExecutionRow[] {
  const byIndex = new Map<number, JobExecutionRow>();
  for (const job of jobs) {
    const existing = byIndex.get(job.job_index);
    if (!existing || job.attempt > existing.attempt) byIndex.set(job.job_index, job);
  }
  return Array.from(byIndex.values()).sort((a, b) => a.job_index - b.job_index);
}

export function buildEmailExecutionSummaryHtml(
  runId: string,
  workflowName: string,
  status: string,
  startedAt: string,
  completedAt: string | null,
  durationMs: number,
  jobs: JobExecutionRow[],
  failedNodeNames: Map<string, string> = new Map(),
  appUrl?: string,
): string {
  const latest = latestJobAttempts(jobs);
  const successful = latest.filter((j) => j.status === 'success').length;
  const failed = latest.filter((j) => j.status === 'failed').length;
  const skipped = latest.filter((j) => j.status === 'skipped').length;
  const displayStatus = status.replace(/_/g, ' ').toUpperCase();

  let html = `<div style="font-family:Arial,sans-serif;margin:16px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px">`;
  html += `<h2 style="margin:0 0 12px;font-size:18px">CareerPilot Execution Summary</h2>`;
  html += `<p style="margin:4px 0"><strong>Workflow:</strong> ${workflowName}</p>`;
  html += `<p style="margin:4px 0"><strong>Run ID:</strong> ${runId}</p>`;
  html += `<p style="margin:4px 0"><strong>Status:</strong> ${displayStatus}</p>`;
  html += `<p style="margin:4px 0"><strong>Started:</strong> ${startedAt}</p>`;
  if (completedAt) html += `<p style="margin:4px 0"><strong>Completed:</strong> ${completedAt}</p>`;
  html += `<p style="margin:4px 0"><strong>Duration:</strong> ${Math.round(durationMs / 1000)}s</p>`;
  html += `<p style="margin:12px 0 4px"><strong>Jobs processed:</strong> ${latest.length}</p>`;
  html += `<p style="margin:4px 0">Successful: ${successful} · Failed: ${failed} · Skipped: ${skipped}</p>`;
  if (appUrl) {
    html += `<p style="margin:8px 0"><a href="${appUrl.replace(/\/$/, '')}/executions/${runId}" style="color:#2563eb">View execution details</a></p>`;
  }
  html += `<h3 style="margin:16px 0 8px;font-size:15px">Job Results</h3><ul style="padding-left:18px">`;

  for (const job of latest) {
    const icon = job.status === 'success' ? '✓' : job.status === 'failed' ? '✗' : '○';
    html += `<li style="margin-bottom:8px">${icon} ${job.label || `Job ${job.job_index}`}<br/>`;
    html += `Status: ${job.status.toUpperCase()}`;
    if (job.attempt > 1) html += ` · Attempt: ${job.attempt}`;
    if (job.status === 'failed') {
      const failedAt = job.failed_node_id ? failedNodeNames.get(job.failed_node_id) : undefined;
      if (failedAt) html += `<br/>Failed at: ${failedAt}`;
      if (job.error_message) html += `<br/>Error: ${job.error_message}`;
    }
    html += `</li>`;
  }
  html += `</ul></div>`;
  return html;
}

export async function buildEmailSummaryBlock(
  admin: AdminClient,
  runId: string,
): Promise<string> {
  const { data: run } = await admin
    .from('workflow_runs')
    .select('id, status, started_at, finished_at, duration_ms, workflow_snapshot, jobs_total, jobs_successful, jobs_failed, jobs_skipped')
    .eq('id', runId)
    .maybeSingle();
  if (!run) return '';

  const snapshot = run.workflow_snapshot as WorkflowSnapshot | null;
  const workflowName = snapshot?.workflowName || 'Workflow';
  const { data: jobs } = await admin
    .from('workflow_job_executions')
    .select('*')
    .eq('run_id', runId)
    .order('job_index', { ascending: true })
    .order('attempt', { ascending: true });

  const latest = latestJobAttempts((jobs || []) as JobExecutionRow[]);
  const failedNodeNames = new Map<string, string>();
  for (const node of snapshot?.nodes || []) {
    failedNodeNames.set(node.id, node.name);
  }
  const { data: failedNodes } = await admin
    .from('workflow_node_executions')
    .select('workflow_node_id, node_name')
    .eq('run_id', runId)
    .eq('status', 'failed');
  for (const row of failedNodes || []) {
    failedNodeNames.set(row.workflow_node_id as string, row.node_name as string);
  }

  const appUrl = Deno.env.get('APP_URL') || '';
  return buildEmailExecutionSummaryHtml(
    runId,
    workflowName,
    String(run.status || 'success'),
    String(run.started_at || new Date().toISOString()),
    run.finished_at as string | null,
    Number(run.duration_ms ?? 0),
    latest,
    failedNodeNames,
    appUrl || undefined,
  );
}
