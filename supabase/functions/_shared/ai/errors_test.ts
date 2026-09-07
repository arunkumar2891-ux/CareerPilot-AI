import { classifyProviderFailure, sanitizeAiErrorMessage, shouldFallback } from './errors.ts';
import {
  buildAllowedResumeLines,
  canonicalizeAtsResumeOutput,
  normalizeResumeLine,
  validateResumeOutput,
} from './validate-resume.ts';

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

Deno.test('canonicalizeAtsResumeOutput maps legacy template headers to strict ATS sections', () => {
  const legacy = `ARUN KUMAR
Integration Architect | GenAI Developer

Location: Chennai
Email: arun@example.com

PROFESSIONAL SUMMARY
Results-driven Integration Architect with 10+ years of experience.

PROFESSIONAL EXPERIENCE
Palo Alto Networks
- Built scalable APIs.

EDUCATION
B.Tech in Information Technology

CORE COMPETENCIES
TypeScript, Python`;
  const canonical = canonicalizeAtsResumeOutput(legacy);
  if (!canonical.includes('NAME\nARUN KUMAR')) throw new Error('missing NAME');
  if (!canonical.includes('CONTACT\nIntegration Architect | GenAI Developer')) throw new Error('missing CONTACT');
  if (!canonical.includes('SUMMARY\nResults-driven Integration Architect')) throw new Error('missing SUMMARY');
  if (!canonical.includes('SKILLS\nTypeScript, Python')) throw new Error('missing SKILLS');
  const ok = validateResumeOutput(canonical, { groundingSource: legacy });
  if (!ok.ok) throw new Error(`expected canonical legacy output to validate: ${ok.reason}`);
});

Deno.test('validateResumeOutput accepts a complete source-grounded resume and rejects unsupported facts', () => {
  const source = `Jane Doe
Principal Engineer
Email: jane@example.com
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

SKILLS
TypeScript, Python

PROFESSIONAL EXPERIENCE
Acme
- Shipped APIs used by millions of users.

EDUCATION
B.S. Computer Science
`;
  const ok = validateResumeOutput(output, { groundingSource: source });
  if (!ok.ok) throw new Error('expected valid');
  const invented = validateResumeOutput(output.replace('Distributed systems engineer.', 'AI executive with 15 years of experience.'), { groundingSource: source });
  if (invented.ok) throw new Error('expected unsupported source line to fail');
  const duplicateSummary = validateResumeOutput(output.replace('EDUCATION\nB.S. Computer Science', 'SUMMARY\nTypeScript, Python'), { groundingSource: source });
  if (duplicateSummary.ok) throw new Error('expected duplicate section to fail');
});

Deno.test('normalizeResumeLine accepts middle-dot bullets and labeled contact values', () => {
  const allowed = buildAllowedResumeLines(`Email: jane@example.com
·     Shipped APIs used by millions of users.`);
  if (!allowed.has(normalizeResumeLine('jane@example.com'))) throw new Error('email value missing');
  if (!allowed.has(normalizeResumeLine('- Shipped APIs used by millions of users.'))) throw new Error('bullet mismatch');
});

Deno.test('validateResumeOutput accepts truncated summary prefix from role bank', () => {
  const longSummary = 'Results-driven Integration Architect with 10+ years of experience in enterprise software engineering and cloud solutions across multiple domains and teams.';
  const source = `ARUN KUMAR
Email: arun@example.com
PROFESSIONAL SUMMARY
${longSummary}
Palo Alto Networks
- Built scalable APIs.
B.Tech in Information Technology
TypeScript, Python`;
  const truncated = longSummary.slice(0, 120);
  const output = `NAME
ARUN KUMAR

CONTACT
arun@example.com

SUMMARY
${truncated}

SKILLS
TypeScript, Python

PROFESSIONAL EXPERIENCE
Palo Alto Networks
- Built scalable APIs.

EDUCATION
B.Tech in Information Technology
`;
  const ok = validateResumeOutput(output, { groundingSource: source });
  if (!ok.ok) throw new Error(`expected truncated summary to pass: ${ok.ok ? '' : ok.reason}`);
});
