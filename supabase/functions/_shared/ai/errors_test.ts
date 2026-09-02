import { classifyProviderFailure, sanitizeAiErrorMessage, shouldFallback } from './errors.ts';
import { validateResumeOutput } from './validate-resume.ts';

Deno.test('sanitizeAiErrorMessage redacts keys', () => {
  const out = sanitizeAiErrorMessage('Bearer gsk_LIVESECRETKEY123 key=AIzaSyFAKESECRET');
  if (out.includes('gsk_LIVE') || out.includes('AIzaSyFAKE')) throw new Error(out);
});

Deno.test('timeout and 5xx are retryable', () => {
  const timeout = classifyProviderFailure('gemini', new Error('timed out after 30s'));
  if (!shouldFallback(timeout)) throw new Error('timeout should fallback');
  const rate = classifyProviderFailure('gemini', new Error('quota'), 429);
  if (!shouldFallback(rate)) throw new Error('429 should fallback');
  const bad = classifyProviderFailure('gemini', new Error('invalid argument'), 400);
  if (shouldFallback(bad)) throw new Error('400 should not fallback');
});

Deno.test('validateResumeOutput accepts ATS text and rejects garbage', () => {
  const ok = validateResumeOutput(`SUMMARY
Hello

PROFESSIONAL EXPERIENCE
Worked at Acme
`);
  if (!ok.ok) throw new Error('expected valid');
  const bad = validateResumeOutput('hello world');
  if (bad.ok) throw new Error('expected invalid');
});
