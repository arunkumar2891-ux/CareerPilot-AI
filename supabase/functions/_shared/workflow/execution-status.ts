export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'partially_failed';

export interface JobCounterInput {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
}

export function deriveRunStatus(
  runStatus: string,
  counters: JobCounterInput,
  hasRunLevelFailure: boolean,
): ExecutionStatus {
  if (runStatus === 'cancelled') return 'cancelled';
  if (runStatus === 'running' || runStatus === 'queued') return runStatus as ExecutionStatus;
  if (hasRunLevelFailure && counters.failed === 0) return 'failed';
  if (counters.total > 0 && counters.failed > 0 && counters.successful > 0) return 'partially_failed';
  if (counters.total > 0 && counters.failed > 0 && counters.successful === 0) return 'failed';
  if (runStatus === 'failed') return 'failed';
  return 'success';
}

export function classifyExecutionError(message: string): {
  errorType: string;
  errorCode: string;
  sanitizedMessage: string;
} {
  const sanitizedMessage = message
    .replace(/key=[^&\s]+/gi, 'key=REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED')
    .replace(/AIza[A-Za-z0-9_-]+/g, 'REDACTED')
    .replace(/gsk_[A-Za-z0-9]+/g, 'REDACTED');

  if (/timed out/i.test(sanitizedMessage)) {
    return { errorType: 'TIMEOUT', errorCode: 'REQUEST_TIMEOUT', sanitizedMessage };
  }
  if (/LaTeX compile failed/i.test(sanitizedMessage)) {
    return { errorType: 'COMPILE_ERROR', errorCode: 'LATEX_COMPILE_FAILED', sanitizedMessage };
  }
  if (/429|rate limit/i.test(sanitizedMessage)) {
    return { errorType: 'RATE_LIMIT', errorCode: 'PROVIDER_RATE_LIMIT', sanitizedMessage };
  }
  if (/not configured|api_key|api key/i.test(sanitizedMessage)) {
    return { errorType: 'CONFIG_ERROR', errorCode: 'MISSING_CREDENTIAL', sanitizedMessage };
  }
  return { errorType: 'EXECUTION_ERROR', errorCode: 'NODE_FAILED', sanitizedMessage };
}

export function jobLabelFromInput(jobIndex: number, input: unknown): string {
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
