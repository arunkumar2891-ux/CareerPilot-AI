import { deriveRunStatus, classifyExecutionError, jobLabelFromInput } from './execution-status.ts';

Deno.test('deriveRunStatus returns partially_failed when mixed outcomes', () => {
  const status = deriveRunStatus('success', { total: 10, successful: 8, failed: 2, skipped: 0 }, false);
  if (status !== 'partially_failed') throw new Error(`expected partially_failed, got ${status}`);
});

Deno.test('deriveRunStatus returns success when all jobs succeed', () => {
  const status = deriveRunStatus('success', { total: 3, successful: 3, failed: 0, skipped: 0 }, false);
  if (status !== 'success') throw new Error(`expected success, got ${status}`);
});

Deno.test('deriveRunStatus returns failed when all jobs fail', () => {
  const status = deriveRunStatus('success', { total: 3, successful: 0, failed: 3, skipped: 0 }, false);
  if (status !== 'failed') throw new Error(`expected failed, got ${status}`);
});

Deno.test('classifyExecutionError detects timeout', () => {
  const err = classifyExecutionError('Request timed out after 75s');
  if (err.errorCode !== 'REQUEST_TIMEOUT') throw new Error(err.errorCode);
});

Deno.test('jobLabelFromInput uses company and role', () => {
  const label = jobLabelFromInput(3, { company: 'Acme', title: 'Engineer' });
  if (!label.includes('Acme') || !label.includes('Engineer')) throw new Error(label);
});
