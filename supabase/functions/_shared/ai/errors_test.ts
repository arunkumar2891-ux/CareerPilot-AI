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

Deno.test('validateResumeOutput treats PERSONAL PROJECTS and CERTIFICATION as optional and keeps 8-header order', () => {
  const withoutOptional = `NAME
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
  const missing = validateResumeOutput(withoutOptional, { skipGrounding: true });
  if (!missing.ok) throw new Error(`optional sections should be omittable: ${missing.reason}`);

  const withOptional = `NAME
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

PERSONAL PROJECTS
Frames to Video | Solo Developer
- Technologies: React, FFmpeg.wasm
- Built a privacy-first video converter that runs fully in the browser.

CERTIFICATION
Google Cloud Professional Architect

EDUCATION
B.S. Computer Science
`;
  const present = validateResumeOutput(withOptional, {
    skipGrounding: true,
    certificationSource: 'Google Cloud Professional Architect',
  });
  if (!present.ok) throw new Error(`expected optional-section resume to validate: ${present.reason}`);
  const skillsAt = present.text.indexOf('SKILLS');
  const experienceAt = present.text.indexOf('PROFESSIONAL EXPERIENCE');
  const projectsAt = present.text.indexOf('PERSONAL PROJECTS');
  const certAt = present.text.indexOf('CERTIFICATION');
  const educationAt = present.text.indexOf('EDUCATION');
  if (!(skillsAt < experienceAt && experienceAt < projectsAt && projectsAt < certAt && certAt < educationAt)) {
    throw new Error(`wrong 8-header order\n${present.text}`);
  }
});

Deno.test('canonicalizeAtsResumeOutput maps project header drift to PERSONAL PROJECTS', () => {
  for (const alias of ['PROJECTS', 'KEY PROJECTS', 'SIDE PROJECTS']) {
    const text = `NAME
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

${alias}
Frames to Video | Solo Developer
- Technologies: React, FFmpeg.wasm
- Built a privacy-first video converter.

EDUCATION
B.S. Computer Science
`;
    const canonical = canonicalizeAtsResumeOutput(text);
    if (!/^PERSONAL PROJECTS$/m.test(canonical)) {
      throw new Error(`${alias} did not map to PERSONAL PROJECTS\n${canonical}`);
    }
    const checked = validateResumeOutput(text, { skipGrounding: true });
    if (!checked.ok) throw new Error(`${alias} resume failed validation: ${checked.reason}`);
  }
});

const EIGHT_SECTION_RESUME = `NAME
ARUNKUMAR JS

CONTACT
Email: arunkumar2891@gmail.com
Phone: +91 6380069156
Location: Chennai, Tamil Nadu
LinkedIn: https://www.linkedin.com/in/arunkumar-j-s-05164393/
GitHub: https://github.com/arunkumar2891-ux/

SUMMARY
I am an Integration Architect and GenAI developer with over 10 years of experience in enterprise software engineering, focusing on cloud solutions, REST API design, and AI-augmented application development. I specialize in translating complex technical requirements into production-ready software and debugging distributed cloud systems.

SKILLS

GenAI & Agentic AI:
- Vertex AI, RAG Architecture, Prompt Engineering, AI Agents, Tool Use
- Embeddings, Vector Retrieval, Chain-of-Thought, Token Optimization, Context Window Management

Cloud:
- Azure Functions, Azure APIM, Azure Application Insights
- GCP (Pub/Sub, BigQuery, Cloud Functions, Vertex AI)
- Salesforce

Backend & APIs:
- REST API Design, Node.js, Express.js, WebSockets, API Governance

Integration & Databases:
- SnapLogic iPaaS, Dell Boomi, Kafka, Event-Driven Architecture
- PostgreSQL, Supabase, MySQL, BigQuery

DevOps & Observability:
- Git, GitHub, GitHub Actions, CI/CD, Harness
- GCP Cloud Functions CI, Vault
- Datadog APM, Chronosphere, GCP Logging

PROFESSIONAL EXPERIENCE

PALO ALTO NETWORKS | Integration Architect - Integration Center of Excellence
Jul 2024 - Present | Bengaluru
- Redesigned a fragmented enterprise integration architecture from 20 independently maintained pipelines into 3 reusable common pipelines and 9 simplified worker pipelines.
- Reduced total worker-pipeline snaps by 66% (278 to 94), eliminating 164 redundant components and reducing ongoing maintenance burden by two-thirds.
- Architected migration of critical integration state from Datadog to BigQuery, removing a 15-day data retention risk and improving query latency 4-10x.
- Mentored 5+ engineers, trained 30+ team members, and coordinated work across 5+ cross-functional teams.

INFOSYS | Senior Consultant / Consultant / Senior Associate Consultant
Feb 2021 - Jul 2024 | India
- Delivered enterprise SnapLogic and Dell Boomi integration solutions across GCP, Azure, Oracle, SAP, and Salesforce environments for manufacturing and telecom clients.
- Implemented API-led pipeline governance, common error-logging frameworks, automated reprocessing, and monitoring with Kafka, GitHub, and Azure Functions.

TATA CONSULTANCY SERVICES (TCS) | Systems Engineer
Jun 2016 - Feb 2021 | India
- Built integration solutions across manufacturing, telecom, and enterprise domains using Dell Boomi and SnapLogic, including B2B interfaces and monitoring frameworks.

PERSONAL PROJECTS

CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
- Technologies: React 18, TypeScript, Vite, Supabase/PostgreSQL, Edge Functions/Deno, Gemini 3.6 Flash, Groq, Apify, Google Drive OAuth2, Resend, LaTeX, Render.com
- Built a unified GenAI application covering job discovery, ATS resume tailoring, cover letters, application tracking, and an AI Copilot.
- Implemented a career corpus with a master ATS bullet bank, 2-page resume template, 6 role playbooks, and tagged evidence chunks that select existing bullets while preserving metrics.

Pic-Reel / FrameFlow Hyperlapse Tool | Solo GenAI Developer
- Technologies: React 19, TanStack Start, TypeScript 5.8, Vite 7.3, Tailwind CSS v4, FFmpeg.wasm, Render.com
- Built a privacy-first browser application that converts photo sequences to MP4 without uploading images to a server.

Cric-Scorer / IPL 2026 Prediction App / PlanItX | Solo GenAI Developer
- Technologies: React, TypeScript, Vite, Tailwind CSS, Supabase/PostgreSQL, Node.js, Express.js, Bolt.new, Cursor AI, Lovable.dev
- Built Cric-Scorer with 3 deterministic domain engines and a 14-table Supabase schema for ball-by-ball scoring, statistics, and conflict prevention.

CERTIFICATION
- SnapLogic Certified Enterprise Automation Professional (Mar 2024)
- SnapLogic Partner Integrator Library (Feb 2024)
- Dell Boomi Professional Developer (2021)
- Dell Boomi Associate Developer (2020)

EDUCATION
- B.Tech - Information Technology, SASTRA University, 2016, Thanjavur
`;

Deno.test('canonicalizeAtsResumeOutput keeps PERSONAL PROJECTS as its own section', () => {
  const canonical = canonicalizeAtsResumeOutput(EIGHT_SECTION_RESUME);
  if (!/^PERSONAL PROJECTS$/m.test(canonical)) {
    throw new Error(`PERSONAL PROJECTS header was lost or merged\n${canonical}`);
  }
  const experienceAt = canonical.indexOf('PROFESSIONAL EXPERIENCE');
  const projectsAt = canonical.indexOf('PERSONAL PROJECTS');
  const certAt = canonical.indexOf('CERTIFICATION');
  if (!(experienceAt < projectsAt && projectsAt < certAt)) {
    throw new Error(`PERSONAL PROJECTS is out of order\n${canonical}`);
  }
  if (canonical.includes('PERSONAL PROJECTS\n\nCareerPilot')) return;
  if (!canonical.includes('Technologies: React 18')) {
    throw new Error('project technologies line was dropped');
  }
});

Deno.test('validateResumeOutput accepts the categorized eight-section resume format', () => {
  const checked = validateResumeOutput(EIGHT_SECTION_RESUME, {
    groundingSource: EIGHT_SECTION_RESUME,
    certificationSource: 'SnapLogic Certified Enterprise Automation Professional (Mar 2024)',
  });
  if (!checked.ok) throw new Error(`eight-section resume failed validation: ${checked.reason}`);

  for (const marker of [
    'GenAI & Agentic AI:',
    'PALO ALTO NETWORKS | Integration Architect - Integration Center of Excellence',
    'Jul 2024 - Present | Bengaluru',
    'CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer',
    '- Technologies: React 18',
    '- B.Tech - Information Technology, SASTRA University, 2016, Thanjavur',
  ]) {
    if (!checked.text.includes(marker)) {
      throw new Error(`validated output dropped "${marker}"\n${checked.text}`);
    }
  }
});

Deno.test('validateResumeOutput keeps project bullets out of the experience bullet budget', () => {
  const checked = validateResumeOutput(EIGHT_SECTION_RESUME, { skipGrounding: true });
  if (!checked.ok) throw new Error(`expected resume to validate: ${checked.reason}`);
  const projectsAt = checked.text.indexOf('PERSONAL PROJECTS');
  const experience = checked.text.slice(
    checked.text.indexOf('PROFESSIONAL EXPERIENCE'),
    projectsAt,
  );
  if (experience.includes('Technologies: React 18')) {
    throw new Error('project content leaked into PROFESSIONAL EXPERIENCE');
  }
});

function skeletonResume(experienceBody: string): string {
  return `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
I build platforms for enterprise customers.

SKILLS
TypeScript, Python

PROFESSIONAL EXPERIENCE
${experienceBody}

EDUCATION
B.S. Computer Science`;
}

function uniqueBullets(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `- Shipped platform capability ${i + 1} for production traffic.`);
}

Deno.test('validateResumeOutput allows a long source resume to keep more than 22 experience bullets', () => {
  const bullets = uniqueBullets(26).join('\n');
  const source = skeletonResume(`Acme | Engineer | 2018-2024\n${bullets}`);
  const output = skeletonResume(`Acme | Engineer | 2018-2024\n${bullets}`);
  const result = validateResumeOutput(output, {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (!result.ok) throw new Error(`expected source-length experience to validate: ${result.reason}`);
});

Deno.test('validateResumeOutput does not count hyphenated role/date headers as experience bullets', () => {
  const bullets = uniqueBullets(21).join('\n');
  const source = skeletonResume(
    `Acme | Engineer | 2020-2022\nBeta | Architect | 2022-2024\n${bullets}`,
  );
  const output = skeletonResume(
    `- Acme | Engineer | 2020-2022\n- Beta | Architect | 2022-2024\n${bullets}`,
  );
  const result = validateResumeOutput(output, {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (!result.ok) throw new Error(`expected hyphenated role headers to be ignored: ${result.reason}`);
});

Deno.test('validateResumeOutput still rejects experience padded far beyond a short source', () => {
  const source = skeletonResume(`Acme | Engineer | 2020-2024\n${uniqueBullets(8).join('\n')}`);
  const output = skeletonResume(`Acme | Engineer | 2020-2024\n${uniqueBullets(24).join('\n')}`);
  const result = validateResumeOutput(output, {
    groundingSource: source,
    skipGrounding: true,
    skipHumanVoice: true,
  });
  if (result.ok) throw new Error('expected too_many_experience_bullets');
  if (result.reason !== 'too_many_experience_bullets') throw new Error(result.reason);
});

Deno.test('normalizeResumeLine folds unicode dashes, times, arrows, and narrow spaces', () => {
  const folded = normalizeResumeLine(
    '- Migrated state, eliminating a 15‑day retention risk; improved 4‑10× (2‑5 s → < 500 ms) and cost dropped 10‑80×.',
  );
  const ascii = normalizeResumeLine(
    '- Migrated state, eliminating a 15-day retention risk; improved 4-10x (2-5 s -> < 500 ms) and cost dropped 10-80x.',
  );
  if (folded !== ascii) throw new Error(`unicode fold mismatch:\n${folded}\n${ascii}`);
});

Deno.test('validateResumeOutput accepts Groq unicode copies of a source achievement', () => {
  const ascii =
    '- Migrated critical integration state from Datadog to BigQuery, eliminating a 15-day retention risk; query latency improved 4-10x (2-5s -> < 500 ms) and cost dropped 10-80x.';
  const groq =
    '- Migrated critical integration state from Datadog to BigQuery, eliminating a 15‑day retention risk; query latency improved 4‑10× (2‑5 s → < 500 ms) and cost dropped 10‑80×.';
  const result = validateResumeOutput(skeletonResume(groq), {
    groundingSource: skeletonResume(ascii),
    skipHumanVoice: true,
  });
  if (!result.ok) throw new Error(`expected unicode achievement to validate: ${result.reason}`);
});

Deno.test('validateResumeOutput accepts wrapped skill lists and slight category rewrites', () => {
  const sourceSkills = `AI & Agentic Workflows: AI agents, tool calling, RAG architecture, Gemini 2.5/3.6
Flash/Pro, prompt engineering, token optimization, context management, error
recovery, retry strategy
Vertex AI, RAG architecture, AI agents, tool calling`;
  const geminiSkills =
    'AI & GenAI: Gemini 2.5/3.6, Vertex AI, RAG architecture, AI agents, tool calling, prompt engineering, context management, token optimization, error recovery';
  const truncatedSkills =
    'AI & Agentic Workflows: AI agents, tool calling, RAG architecture, Gemini 2.5/3.6 Flash/Pro, prompt engineering, token optimization, context management, error recovery, retry strat';
  const source = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
I build AI platforms.

SKILLS
${sourceSkills}

PROFESSIONAL EXPERIENCE
Acme
- Shipped APIs used by millions of users.

EDUCATION
B.S. Computer Science`;
  const asResume = (skills: string) => `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
I build AI platforms.

SKILLS
${skills}

PROFESSIONAL EXPERIENCE
Acme
- Shipped APIs used by millions of users.

EDUCATION
B.S. Computer Science`;
  const gemini = validateResumeOutput(asResume(geminiSkills), {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (!gemini.ok) throw new Error(`expected rewritten skill line to validate: ${gemini.reason}`);
  const truncated = validateResumeOutput(asResume(truncatedSkills), {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (!truncated.ok) throw new Error(`expected truncated skill line to validate: ${truncated.reason}`);
});

Deno.test('validateResumeOutput drops a repeated experience bullet instead of failing', () => {
  const bullet = '- Shipped APIs used by millions of users.';
  const source = skeletonResume(`Acme\n${bullet}`);
  const output = skeletonResume(`Acme\n${bullet}\n${bullet}`);
  const result = validateResumeOutput(output, {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (!result.ok) throw new Error(`expected duplicate bullet to be dropped: ${result.reason}`);
  const experience = result.text.split('PROFESSIONAL EXPERIENCE')[1] || '';
  const copies = experience.split('\n').filter((line) => line.includes('Shipped APIs')).length;
  if (copies !== 1) throw new Error(`expected one copy, got ${copies}:\n${result.text}`);
});

Deno.test('validateResumeOutput allows a summary that restates an experience bullet', () => {
  const bullet = '- Built CareerPilot AI with Gemini 3.6 Flash and Groq fallback.';
  const source = skeletonResume(`CareerPilot AI\n${bullet}`);
  const output = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Built CareerPilot AI with Gemini 3.6 Flash and Groq fallback.

SKILLS
TypeScript, Python

PROFESSIONAL EXPERIENCE
CareerPilot AI
${bullet}

EDUCATION
B.S. Computer Science`;
  const result = validateResumeOutput(output, {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (!result.ok) throw new Error(`summary restating a bullet must validate: ${result.reason}`);
});

Deno.test('validateResumeOutput drops an extra unsupported experience bullet instead of failing', () => {
  const grounded = '- Shipped APIs used by millions of users.';
  const invented = '- Processed over 530,000 AI tokens in a single month across 24 pipeline runs.';
  const source = skeletonResume(`Acme\n${grounded}`);
  const output = skeletonResume(`Acme\n${grounded}\n${invented}`);
  const result = validateResumeOutput(output, {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (!result.ok) throw new Error(`expected salvage to drop invented bullet: ${result.reason}`);
  if (result.text.includes('530,000')) throw new Error(`invented metric should be removed:\n${result.text}`);
  if (!result.text.includes('Shipped APIs')) throw new Error(`grounded bullet should remain:\n${result.text}`);
});

Deno.test('validateResumeOutput does not salvage the last experience bullet', () => {
  const source = skeletonResume('Acme\n- Shipped APIs used by millions of users.');
  const output = skeletonResume('Acme\n- Processed over 530,000 AI tokens in a single month.');
  const result = validateResumeOutput(output, {
    groundingSource: source,
    skipHumanVoice: true,
  });
  if (result.ok) throw new Error('last unsupported bullet must stay a validation error so a provider can repair it');
  if (!result.reason.startsWith('unsupported_source_line')) {
    throw new Error(`expected unsupported_source_line, got ${result.reason}`);
  }
});

Deno.test('ATS prompt forbids merging bullets and inventing metrics', async () => {
  const { ATS_SYSTEM_PROMPT, groundingRetryPrompt } = await import('../career-corpus/prompt.ts');
  if (!ATS_SYSTEM_PROMPT.includes('exactly one source bullet')) {
    throw new Error('system prompt must require one-to-one source bullets');
  }
  if (!ATS_SYSTEM_PROMPT.includes('Do not merge')) {
    throw new Error('system prompt must forbid merging source bullets');
  }
  const retry = groundingRetryPrompt('unsupported_source_line: - invented');
  if (!retry.includes('unsupported_source_line') || !retry.includes('near-verbatim')) {
    throw new Error(`repair prompt too weak: ${retry}`);
  }
});


