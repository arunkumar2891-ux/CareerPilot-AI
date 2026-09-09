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

Deno.test('assembleSourceLockedResume builds a valid grounded resume', async () => {
  const catalog = [
    { id: 'B001', text: 'Jane Doe', isBullet: false, normalized: 'jane doe' },
    { id: 'B002', text: 'Principal Engineer', isBullet: false, normalized: 'principal engineer' },
    { id: 'B003', text: 'jane@example.com', isBullet: false, normalized: 'jane@example.com' },
    { id: 'B004', text: 'Distributed systems engineer.', isBullet: false, normalized: 'distributed systems engineer.' },
    { id: 'B005', text: 'Acme Corp', isBullet: false, normalized: 'acme corp' },
    { id: 'B006', text: 'Shipped APIs used by millions of users.', isBullet: true, normalized: 'shipped apis used by millions of users.' },
    { id: 'B007', text: 'TypeScript, Python', isBullet: false, normalized: 'typescript, python' },
    { id: 'B008', text: 'B.S. Computer Science', isBullet: false, normalized: 'b.s. computer science' },
  ];
  const groundingSource = catalog.map((line) => line.isBullet ? `- ${line.text}` : line.text).join('\n');
  const { assembleSourceLockedResume, buildDeterministicGroundingSource } = await import('../career-corpus/assemble-source-locked-resume.ts');
  const input = {
    contactBlock: 'Name: Jane Doe\nTitle: Principal Engineer\nEmail: jane@example.com',
    summarySource: 'Distributed systems engineer.',
    skillsSource: 'TypeScript, Python',
    educationSource: 'B.S. Computer Science',
    rerankedBulletIds: ['B006'],
    catalog,
  };
  const output = assembleSourceLockedResume(input);
  const ok = validateResumeOutput(output, {
    groundingSource: buildDeterministicGroundingSource(input),
    skillsSource: 'TypeScript, Python',
    educationSource: 'B.S. Computer Science',
    skipGrounding: true,
  });
  if (!ok.ok) throw new Error(`expected deterministic resume to validate: ${ok.reason}`);
});

/**
 * The master resume carries its own section headers (`EDUCATION`, `TECHNICAL SKILLS`, ...),
 * so they land in the bullet catalog. Reusing one as section *content* emitted a second
 * `EDUCATION` line, which canonicalization then dropped as an empty duplicate — surfacing
 * as `missing_ats_section` and taking down the deterministic fallback.
 */
Deno.test('assembleSourceLockedResume ignores catalog lines that are ATS headers', async () => {
  const catalog = [
    { id: 'B001', text: 'Jane Doe', isBullet: false, normalized: 'jane doe' },
    { id: 'B002', text: 'PROFESSIONAL SUMMARY', isBullet: false, normalized: 'professional summary' },
    { id: 'B003', text: 'Distributed systems engineer with a decade of platform experience.', isBullet: false, normalized: 'distributed systems engineer with a decade of platform experience.' },
    { id: 'B004', text: 'TECHNICAL SKILLS', isBullet: false, normalized: 'technical skills' },
    { id: 'B005', text: 'TypeScript, Python, Go', isBullet: false, normalized: 'typescript, python, go' },
    { id: 'B006', text: 'PROFESSIONAL EXPERIENCE', isBullet: false, normalized: 'professional experience' },
    { id: 'B007', text: 'Acme Corp', isBullet: false, normalized: 'acme corp' },
    { id: 'B008', text: 'Shipped APIs used by millions of users.', isBullet: true, normalized: 'shipped apis used by millions of users.' },
    { id: 'B009', text: 'EDUCATION', isBullet: false, normalized: 'education' },
    { id: 'B010', text: 'B.Tech in Information Technology', isBullet: false, normalized: 'b.tech in information technology' },
  ];

  const { assembleSourceLockedResume } = await import('../career-corpus/assemble-source-locked-resume.ts');

  // Mandatory sections come back empty when the stored master resume lacks the
  // `==== TITLE ====` separators the extractor keys off, forcing catalog fallbacks.
  const output = assembleSourceLockedResume({
    contactBlock: 'Name: Jane Doe\nEmail: jane@example.com',
    summarySource: '',
    skillsSource: '',
    educationSource: '',
    rerankedBulletIds: ['B008'],
    catalog,
  });

  for (const header of ['EDUCATION', 'TECHNICAL SKILLS', 'PROFESSIONAL SUMMARY', 'PROFESSIONAL EXPERIENCE']) {
    const occurrences = output.split('\n').filter((line) => line.trim() === header).length;
    const allowed = header === 'PROFESSIONAL EXPERIENCE' || header === 'EDUCATION' ? 1 : 0;
    if (occurrences !== allowed) {
      throw new Error(`expected ${allowed} "${header}" line(s), got ${occurrences}\n${output}`);
    }
  }

  const ok = validateResumeOutput(output, { skipGrounding: true });
  if (!ok.ok) throw new Error(`expected assembly to validate, got ${ok.reason}\n${output}`);
});

/**
 * Production dump: empty mandatory sections + scored non-bullets (title, location,
 * summary paragraph, sync stamp) produced SUMMARY=title, SKILLS=location, and
 * EXPERIENCE filled with the master summary instead of job bullets.
 */
Deno.test('assembleSourceLockedResume maps catalog fallbacks into the correct ATS sections', async () => {
  const summary = 'Results-driven Integration Architect and GenAI-native developer with 10+ years of experience in enterprise software engineering and customer-facing platform work.';
  const catalog = [
    { id: 'B001', text: 'ARUNKUMAR JS', isBullet: false, normalized: 'arunkumar js' },
    { id: 'B002', text: 'Integration Architect | GenAI Developer | Forward Deployment Engineer', isBullet: false, normalized: 'integration architect | genai developer | forward deployment engineer' },
    { id: 'B003', text: 'Location: Chennai, Tamil Nadu', isBullet: false, normalized: 'location: chennai, tamil nadu' },
    { id: 'B004', text: 'arunkumar2891@gmail.com', isBullet: false, normalized: 'arunkumar2891@gmail.com' },
    { id: 'B005', text: summary, isBullet: false, normalized: summary.toLowerCase() },
    { id: 'B006', text: 'Forward Deployment Engineering:', isBullet: false, normalized: 'forward deployment engineering:' },
    { id: 'B007', text: 'Customer-Facing Technical Work: Bridging business needs and engineering solutions', isBullet: true, normalized: 'customer-facing technical work: bridging business needs and engineering solutions' },
    { id: 'B008', text: 'PALO ALTO NETWORKS', isBullet: false, normalized: 'palo alto networks' },
    { id: 'B009', text: 'Built 2 conversational AI agents powered by Gemini 2.5 Pro with RAG corpus of 50+ pipeline metrics', isBullet: true, normalized: 'built 2 conversational ai agents powered by gemini 2.5 pro with rag corpus of 50+ pipeline metrics' },
    { id: 'B010', text: '[CareerPilot] Last synced: Sep 7, 2026, 3:41 PM', isBullet: false, normalized: '[careerpilot] last synced: sep 7, 2026, 3:41 pm' },
    { id: 'B011', text: 'TypeScript | JavaScript | Python | REST APIs | RAG | Pub/Sub', isBullet: true, normalized: 'typescript | javascript | python | rest apis | rag | pub/sub' },
    { id: 'B012', text: 'B.Tech – Information Technology', isBullet: false, normalized: 'b.tech – information technology' },
  ];

  const { assembleSourceLockedResume } = await import('../career-corpus/assemble-source-locked-resume.ts');
  const output = assembleSourceLockedResume({
    contactBlock: [
      'Name: ARUNKUMAR JS',
      'Title: Integration Architect | GenAI Developer | Forward Deployment Engineer',
      'Email: arunkumar2891@gmail.com',
      'Phone: +91 6380069156',
      'Location: Chennai, Tamil Nadu',
      'LinkedIn: https://www.linkedin.com/in/arunkumar-j-s-05164393/',
      'GitHub: https://github.com/arunkumar2891-ux/',
      'PANW start: Jul 2024',
    ].join('\n'),
    summarySource: '',
    skillsSource: '',
    educationSource: '',
    rerankedBulletIds: ['B002', 'B003', 'B005', 'B010', 'B009', 'B007', 'B011'],
    catalog,
  });

  const section = (name: string) => {
    const headers = ['NAME', 'CONTACT', 'SUMMARY', 'SKILLS', 'PROFESSIONAL EXPERIENCE', 'CERTIFICATION', 'EDUCATION'];
    const lines = output.split('\n');
    const start = lines.findIndex((line) => line.trim() === name);
    if (start < 0) return '';
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      if (headers.includes(lines[i].trim())) break;
      body.push(lines[i]);
    }
    return body.join('\n').trim();
  };

  const summaryBody = section('SUMMARY');
  const skillsBody = section('SKILLS');
  const contactBody = section('CONTACT');
  const experienceBody = section('PROFESSIONAL EXPERIENCE');

  if (!summaryBody.includes('Results-driven Integration Architect')) {
    throw new Error(`SUMMARY should be the professional paragraph, got:\n${summaryBody}`);
  }
  if (summaryBody.includes('Integration Architect |')) {
    throw new Error(`SUMMARY should not be the title line:\n${summaryBody}`);
  }
  if (/location:/i.test(skillsBody)) {
    throw new Error(`SKILLS should not be the location line:\n${skillsBody}`);
  }
  if (!/typescript/i.test(skillsBody) && !/python/i.test(skillsBody)) {
    throw new Error(`SKILLS should contain skill tokens, got:\n${skillsBody}`);
  }
  if (/jul 2024/i.test(contactBody)) {
    throw new Error(`CONTACT should omit employment start date:\n${contactBody}`);
  }
  if (!contactBody.includes('Title: Integration Architect | GenAI Developer | Forward Deployment Engineer')) {
    throw new Error(`CONTACT should preserve the labeled professional title:\n${contactBody}`);
  }
  if (!experienceBody.includes('- Built 2 conversational AI agents')) {
    throw new Error(`EXPERIENCE should include the selected bullet:\n${experienceBody}`);
  }
  if (experienceBody.includes('Results-driven')) {
    throw new Error(`EXPERIENCE should not dump the summary paragraph:\n${experienceBody}`);
  }
  if (/last synced/i.test(experienceBody)) {
    throw new Error(`EXPERIENCE should omit corpus sync stamps:\n${experienceBody}`);
  }
  if (!experienceBody.includes('PALO ALTO NETWORKS')) {
    throw new Error(`EXPERIENCE should keep the company header above the bullet:\n${experienceBody}`);
  }

  const ok = validateResumeOutput(output, { skipGrounding: true });
  if (!ok.ok) throw new Error(`expected assembly to validate, got ${ok.reason}\n${output}`);
});

Deno.test('extractMandatoryResumeSections works without equals banners', async () => {
  const { extractMandatoryResumeSections } = await import('../career-corpus/resume-bank.ts');
  const master = `ARUN KUMAR

PROFESSIONAL SUMMARY
Results-driven Integration Architect with 10+ years of experience.

CORE COMPETENCIES
Forward Deployment Engineering:
- Customer-Facing Technical Work | APIs | TypeScript

PROFESSIONAL EXPERIENCE
PALO ALTO NETWORKS
- Shipped integrations.

EDUCATION
B.Tech in Information Technology
`;
  const sections = extractMandatoryResumeSections(master);
  if (!sections.summary.includes('Results-driven Integration Architect')) {
    throw new Error(`expected summary body, got ${JSON.stringify(sections.summary)}`);
  }
  if (!sections.skills.includes('TypeScript')) {
    throw new Error(`expected skills body, got ${JSON.stringify(sections.skills)}`);
  }
  if (!sections.education.includes('B.Tech')) {
    throw new Error(`expected education body, got ${JSON.stringify(sections.education)}`);
  }

  const bannered = extractMandatoryResumeSections(`
================================================================================
PROFESSIONAL SUMMARY
================================================================================
Results-driven Integration Architect with 10+ years of experience.

================================================================================
CORE COMPETENCIES
================================================================================
- TypeScript | Python

================================================================================
EDUCATION
================================================================================
B.Tech in Information Technology
`);
  if (!bannered.summary.includes('Results-driven')) {
    throw new Error(`banner extractor lost summary: ${JSON.stringify(bannered.summary)}`);
  }
  if (!bannered.skills.includes('TypeScript')) {
    throw new Error(`banner extractor lost skills: ${JSON.stringify(bannered.skills)}`);
  }
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

