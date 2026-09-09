import { classifyProviderFailure, sanitizeAiErrorMessage, shouldFallback } from './errors.ts';
import {
  buildAllowedResumeLines,
  canonicalizeAtsResumeOutput,
  normalizeResumeLine,
  validateHumanVoice,
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

Deno.test('validateResumeOutput allows JD-oriented paraphrase of catalog lines and overlays identity sections', () => {
  const source = `Jane Doe
Email: jane@example.com
Distributed systems engineer specializing in platform APIs.
Acme
- Shipped APIs used by millions of users.
B.S. Computer Science
TypeScript, Python, REST APIs`;
  const gemini = `NAME
Wrong Name

CONTACT
unknown@example.com

SUMMARY
Distributed systems engineer focused on platform APIs for customer-facing integrations.

SKILLS
TypeScript, Python, REST APIs

PROFESSIONAL EXPERIENCE
Acme
- Shipped production APIs used by millions of users to support customer integrations.

EDUCATION
MIT
`;
  const result = validateResumeOutput(gemini, {
    groundingSource: source,
    allowParaphrase: true,
    identity: {
      name: 'Jane Doe',
      contact: 'jane@example.com',
      education: 'B.S. Computer Science',
    },
  });
  if (!result.ok) throw new Error(`expected paraphrased Gemini resume to validate: ${result.reason}`);
  if (!result.text.includes('NAME\nJane Doe')) throw new Error(`NAME should come from catalog:\n${result.text}`);
  if (!result.text.includes('jane@example.com')) throw new Error(`CONTACT should come from catalog:\n${result.text}`);
  if (!result.text.includes('B.S. Computer Science')) throw new Error(`EDUCATION should come from catalog:\n${result.text}`);
  if (result.text.includes('Wrong Name') || result.text.includes('MIT')) {
    throw new Error(`identity overlay leaked Gemini values:\n${result.text}`);
  }
  if (!result.text.includes('customer-facing integrations')) {
    throw new Error(`SUMMARY paraphrase should be kept:\n${result.text}`);
  }

  const inventedMetric = validateResumeOutput(gemini.replace('millions of users', '50 million users'), {
    groundingSource: source,
    allowParaphrase: true,
    identity: { name: 'Jane Doe', contact: 'jane@example.com', education: 'B.S. Computer Science' },
  });
  if (inventedMetric.ok) throw new Error('expected invented metric to fail grounding');
});

Deno.test('validateResumeOutput allows a summary composed from multiple grounded source lines', () => {
  const source = `Integration Architect with 10+ years of software engineering experience.
Built CareerPilot AI with Gemini 3.6 Flash and Groq fallback.
Engineered Pic-Reel as a browser-based media tool using React and FFmpeg WebAssembly.
Shipped 4+ production applications using AI-augmented development workflows.
Reduced RAG review inconsistency from 40% to under 5%.
TypeScript, Python, GCP
B.Tech in Information Technology`;
  const output = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Integration Architect with 10+ years of software engineering experience who shipped 4+ production applications using AI-augmented workflows. Built CareerPilot AI with Gemini 3.6 Flash and Groq fallback alongside the browser-based Pic-Reel media tool. Reduced RAG review inconsistency from 40% to under 5%.

PROFESSIONAL EXPERIENCE
CareerPilot AI
- Built CareerPilot AI with Gemini 3.6 Flash and Groq fallback.

SKILLS
TypeScript, Python, GCP

EDUCATION
B.Tech in Information Technology`;
  const result = validateResumeOutput(output, {
    groundingSource: source,
    allowParaphrase: true,
    identity: {
      name: 'Jane Doe',
      contact: 'Email: jane@example.com',
      education: 'B.Tech in Information Technology',
    },
  });
  if (!result.ok) throw new Error(`multi-source summary should validate: ${result.reason}`);
});

Deno.test('validateResumeOutput accepts experience bullets paraphrased from the 2-page template', () => {
  const masterCatalog = `PALO ALTO NETWORKS
- Designed BigQuery schema using MERGE statements ensuring idempotent operations, preventing duplicate records, and enabling replay-safe processing for critical business data`;
  const twoPageTemplate = `PROJECT: PC to CC Migration
- Designed MERGE statement pattern for idempotent operations; specified changes across 5 pipelines (7 removed, 13 added, 8 modified snaps) with validation scripts`;
  const source = `${masterCatalog}\n${twoPageTemplate}`;
  const output = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Integration Architect with cloud migration experience.

SKILLS
BigQuery, SnapLogic

PROFESSIONAL EXPERIENCE
PALO ALTO NETWORKS
- Designed MERGE statement pattern for idempotent operations and specified changes across 5 pipelines with automated validation scripts.

EDUCATION
B.Tech in Information Technology`;
  const result = validateResumeOutput(output, {
    groundingSource: source,
    allowParaphrase: true,
    identity: {
      name: 'Jane Doe',
      contact: 'Email: jane@example.com',
      education: 'B.Tech in Information Technology',
    },
  });
  if (!result.ok) throw new Error(`expected 2-page template bullet to validate: ${result.reason}`);
});

Deno.test('normalizeResumeLine accepts middle-dot bullets and labeled contact values', () => {
  const allowed = buildAllowedResumeLines(`Email: jane@example.com
·     Shipped APIs used by millions of users.`);
  if (!allowed.has(normalizeResumeLine('jane@example.com'))) throw new Error('email value missing');
  if (!allowed.has(normalizeResumeLine('- Shipped APIs used by millions of users.'))) throw new Error('bullet mismatch');
});

Deno.test('pickMatchedResumeName maps aliases to role resumes', async () => {
  const { pickMatchedResumeName } = await import('../career-corpus/prompt.ts');
  const names = ['Forward Deployment Engineer', 'Cloud Architect'];
  if (pickMatchedResumeName('Forward Deployment Engineer', names) !== 'Forward Deployment Engineer') {
    throw new Error('expected exact role name');
  }
  if (pickMatchedResumeName('master', names) !== 'master') {
    throw new Error('expected master');
  }
  if (pickMatchedResumeName('"Cloud Architect"', names) !== 'Cloud Architect') {
    throw new Error('expected quoted exact match');
  }
  if (pickMatchedResumeName('Solutions Engineer', names) !== 'master') {
    throw new Error('unmatched role should fall back to master');
  }
});

Deno.test('validateHumanVoice rejects stacked AI cliches', () => {
  const cliche = [
    'NAME', 'Jane Doe', '',
    'CONTACT', 'jane@example.com', '',
    'SUMMARY', 'I build platforms.', '',
    'SKILLS', 'TypeScript', '',
    'PROFESSIONAL EXPERIENCE',
    '- Leveraged cutting-edge tools to spearhead innovative solutions.',
    '- Orchestrated best-in-class systems for cross-functional stakeholders.',
    '- Utilized synergized processes and drove impactful results.',
    '',
    'EDUCATION', 'B.S. Computer Science',
  ].join('\n');
  const result = validateHumanVoice(cliche);
  if (result.ok) throw new Error('expected ai_generated_voice');
  if (result.reason !== 'ai_generated_voice') throw new Error(result.reason);
});

Deno.test('buildResumeUserPrompt uses resume and JD blocks', async () => {
  const { buildResumeUserPrompt } = await import('../career-corpus/prompt.ts');
  const prompt = buildResumeUserPrompt({
    jobTitle: 'FDE',
    company: 'Acme',
    jobDescription: 'Ship customer integrations.',
    sourceResume: 'NAME\nJane Doe\nPROFESSIONAL EXPERIENCE\n- Shipped APIs.',
    contactBlock: 'Name: Jane Doe',
  });
  if (!prompt.includes('RESUME:')) throw new Error('missing RESUME block');
  if (!prompt.includes('JOB DESCRIPTION:')) throw new Error('missing JD block');
  if (prompt.includes('BULLET CATALOG')) throw new Error('catalog should be gone');
});

Deno.test('validateResumeOutput reports an empty supplied section as empty, not missing', () => {
  const withEmptyEducation = [
    'NAME', 'Jane Doe', '',
    'CONTACT', 'jane@example.com', '',
    'SUMMARY', 'Distributed systems engineer.', '',
    'SKILLS', 'TypeScript, Python', '',
    'PROFESSIONAL EXPERIENCE', '- Shipped APIs used by millions of users.', '',
    'EDUCATION', '',
  ].join('\n');

  const result = validateResumeOutput(withEmptyEducation, { skipGrounding: true });
  if (result.ok) throw new Error('expected validation to fail');
  if (result.reason !== 'empty_section') {
    throw new Error(`expected empty_section, got ${result.reason}`);
  }
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

Deno.test('validateResumeOutput treats CERTIFICATION as optional and keeps 7-header order when present', () => {
  const withoutCert = `NAME
Jane Doe

CONTACT
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
  const missing = validateResumeOutput(withoutCert, { skipGrounding: true });
  if (!missing.ok) throw new Error(`CERTIFICATION should be optional: ${missing.reason}`);

  const withCert = `${withoutCert.trim()}

CERTIFICATION
Google Cloud Professional Architect
`;
  const present = validateResumeOutput(withCert, {
    skipGrounding: true,
    certificationSource: 'Google Cloud Professional Architect',
  });
  if (!present.ok) throw new Error(`expected certification resume to validate: ${present.reason}`);
  const skillsAt = present.text.indexOf('SKILLS');
  const experienceAt = present.text.indexOf('PROFESSIONAL EXPERIENCE');
  const certAt = present.text.indexOf('CERTIFICATION');
  const educationAt = present.text.indexOf('EDUCATION');
  if (!(skillsAt < experienceAt && experienceAt < certAt && certAt < educationAt)) {
    throw new Error(`wrong 7-header order\n${present.text}`);
  }
});

