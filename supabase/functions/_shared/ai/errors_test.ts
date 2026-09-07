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

Deno.test('validateResumeOutput accepts a complete source-grounded resume and rejects unsupported facts', () => {
  const source = `Jane Doe
Principal Engineer
jane@example.com
Distributed systems engineer.
Acme
- Shipped APIs used by millions of users.
B.S. Computer Science
TypeScript, Python`;
  const output = `NAME
Jane Doe

CONTACT
Principal Engineer
jane@example.com

SUMMARY
Distributed systems engineer.

PROFESSIONAL EXPERIENCE
Acme
- Shipped APIs used by millions of users.

EDUCATION
B.S. Computer Science

SKILLS
TypeScript, Python
`;
  const ok = validateResumeOutput(output, { groundingSource: source });
  if (!ok.ok) throw new Error('expected valid');
  const invented = validateResumeOutput(output.replace('Distributed systems engineer.', 'AI executive with 15 years of experience.'), { groundingSource: source });
  if (invented.ok) throw new Error('expected unsupported source line to fail');
  const duplicateSummary = validateResumeOutput(output.replace('SKILLS\nTypeScript, Python', 'SUMMARY\nTypeScript, Python'), { groundingSource: source });
  if (duplicateSummary.ok) throw new Error('expected duplicate section to fail');
});
