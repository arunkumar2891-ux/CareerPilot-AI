import {
  buildGitHubUrl,
  buildLatexFromAtsText,
  buildLinkedInUrl,
  buildWebsiteUrl,
  extractGitHubHandle,
  extractLinkedInHandle,
  formatWebsiteLabel,
  isExperienceHeaderLine,
  normalizeResumeTextForPdf,
} from './resume-latex.ts';

const SAMPLE_RESUME = `NAME
Jane Doe

CONTACT
Email: jane@example.com
Phone: +1 555 0100

SUMMARY
Integration architect with cloud migration experience.

SKILLS
- BigQuery
- SnapLogic

PROFESSIONAL EXPERIENCE
PALO ALTO NETWORKS
- Designed MERGE statement pattern for idempotent operations.

PERSONAL PROJECTS
CareerPilot AI
- Built an autonomous job-search workflow with Supabase and React.

EDUCATION
B.Tech in Information Technology`;

Deno.test('normalizeResumeTextForPdf converts markdown section headers', () => {
  const normalized = normalizeResumeTextForPdf(`# Jane Doe

## Summary
Cloud engineer.

## Personal Projects
CareerPilot AI
- Built an autonomous job-search workflow.`);
  // The legacy "Personal Projects" heading must canonicalize to the new name.
  if (!normalized.includes('SELECTED PROJECTS')) throw new Error('missing SELECTED PROJECTS header');
  if (!normalized.includes('SUMMARY')) throw new Error('missing SUMMARY header');
});

Deno.test('normalizeResumeTextForPdf converts a Selected Projects markdown heading', () => {
  const normalized = normalizeResumeTextForPdf(`## Selected Projects
CareerPilot AI
- Built an autonomous job-search workflow.`);
  if (!normalized.includes('SELECTED PROJECTS')) throw new Error('missing SELECTED PROJECTS header');
});

Deno.test('buildLatexFromAtsText includes Selected Projects in classic template', () => {
  const latex = buildLatexFromAtsText(SAMPLE_RESUME, { template: 'classic' });
  if (!latex.includes('\\section{Selected Projects}')) {
    throw new Error('classic template missing Selected Projects section');
  }
  if (!latex.includes('CareerPilot AI')) {
    throw new Error('classic template missing project content');
  }
});

Deno.test('buildLatexFromAtsText includes Selected Projects in modern templates', () => {
  const single = buildLatexFromAtsText(SAMPLE_RESUME, { template: 'modern_single' });
  const twoCol = buildLatexFromAtsText(SAMPLE_RESUME, { template: 'modern_two_column' });

  if (!single.includes('\\section{Selected Projects}')) {
    throw new Error('modern_single missing Selected Projects section');
  }
  if (!twoCol.includes('\\textbf{Selected Projects}')) {
    throw new Error('modern_two_column missing Selected Projects section');
  }
  if (single.includes('casual')) {
    throw new Error('modern_single should not use moderncv casual style');
  }
  if (twoCol.includes('paracol')) {
    throw new Error('modern_two_column should not use paracol');
  }
  if (twoCol.includes('sourcesanspro')) {
    throw new Error('modern_two_column should not use sourcesanspro');
  }
});

Deno.test('social links extract handles from full profile URLs', () => {
  const linkedin = 'https://www.linkedin.com/in/arunkumar-j-s-05164393/';
  const github = 'https://github.com/arunkumar2891-ux/';
  if (extractLinkedInHandle(linkedin) !== 'arunkumar-j-s-05164393') {
    throw new Error(`unexpected linkedin handle: ${extractLinkedInHandle(linkedin)}`);
  }
  if (extractGitHubHandle(github) !== 'arunkumar2891-ux') {
    throw new Error(`unexpected github handle: ${extractGitHubHandle(github)}`);
  }
  if (buildLinkedInUrl(linkedin) !== 'https://www.linkedin.com/in/arunkumar-j-s-05164393') {
    throw new Error(`unexpected linkedin url: ${buildLinkedInUrl(linkedin)}`);
  }
  if (buildGitHubUrl(github) !== 'https://github.com/arunkumar2891-ux') {
    throw new Error(`unexpected github url: ${buildGitHubUrl(github)}`);
  }
});

const RESUME_WITH_SOCIAL = `NAME
Jane Doe

CONTACT
Email: jane@example.com
LinkedIn: https://www.linkedin.com/in/arunkumar-j-s-05164393/
GitHub: https://github.com/arunkumar2891-ux/

SUMMARY
Integration architect.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

EDUCATION
B.S. Computer Science`;

Deno.test('buildLatexFromAtsText passes social handles to moderncv, not full URLs', () => {
  const latex = buildLatexFromAtsText(RESUME_WITH_SOCIAL, { template: 'classic' });
  if (latex.includes('https://www.linkedin.com/in/https://')) {
    throw new Error('linkedin URL was doubled in moderncv output');
  }
  if (latex.includes('https://github.com/https://')) {
    throw new Error('github URL was doubled in moderncv output');
  }
  if (!latex.includes('\\social[linkedin]{arunkumar-j-s-05164393}')) {
    throw new Error('expected linkedin handle in moderncv social command');
  }
  if (!latex.includes('\\social[github]{arunkumar2891-ux}')) {
    throw new Error('expected github handle in moderncv social command');
  }
});

Deno.test('buildLatexFromAtsText uses canonical URLs in modern two-column template', () => {
  const latex = buildLatexFromAtsText(RESUME_WITH_SOCIAL, { template: 'modern_two_column' });
  if (!latex.includes('href{https://www.linkedin.com/in/arunkumar-j-s-05164393}')) {
    throw new Error('expected canonical linkedin href in two-column template');
  }
  if (!latex.includes('href{https://github.com/arunkumar2891-ux}')) {
    throw new Error('expected canonical github href in two-column template');
  }
});

Deno.test('skills preserve category headings and nested bullets', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
GenAI & Agentic AI:
 - Vertex AI, RAG Architecture, Prompt Engineering, AI Agents, Tool Use
 - Embeddings, Vector Retrieval, Chain-of-Thought, Token Optimization, Context Window Management

Cloud:
 - Azure Functions, Azure APIM, Azure Application Insights
 - GCP (Pub/Sub, BigQuery, Cloud Functions, Vertex AI)

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('GenAI \\& Agentic AI:')) {
    throw new Error('skills category heading missing or not escaped');
  }
  if (!latex.includes('Vertex AI, RAG Architecture, Prompt Engineering, AI Agents, Tool Use')) {
    throw new Error('skills bullet missing');
  }
  if (latex.includes('\\item GenAI \\& Agentic AI:')) {
    throw new Error('skills category rendered as bullet instead of heading');
  }
  if (!latex.includes('Cloud:')) {
    throw new Error('second skills category missing');
  }
});

Deno.test('personal projects render markdown bullet lines as project titles', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
- CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
Technologies: React 18, TypeScript, Vite
- Built an autonomous job-search workflow with Supabase and React.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  // `&` is escaped by esc(), so assert against the LaTeX-escaped form.
  if (!latex.includes('CareerPilot AI - Autonomous Job Search Platform | GenAI Developer \\& Forward Deployment Engineer')) {
    throw new Error('bullet-style project title missing from classic template');
  }
  if (latex.includes('\\item CareerPilot AI - Autonomous Job Search Platform')) {
    throw new Error('project title was rendered as a bullet instead of a heading');
  }
});

Deno.test('personal projects render user bullet-technologies format with title', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
- Technologies: React 18, TypeScript, Vite, Supabase/PostgreSQL, Edge Functions/Deno, Gemini 3.6 Flash, Groq, Apify, Google Drive OAuth2, Resend, LaTeX, Render.com
- Built a unified GenAI application covering job discovery, ATS resume tailoring, cover letters, application tracking, and an AI Copilot.
- Implemented a career corpus with a master ATS bullet bank, 2-page resume template, 6 role playbooks, and tagged evidence chunks that select existing bullets while preserving metrics.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('CareerPilot AI - Autonomous Job Search Platform | GenAI Developer')) {
    throw new Error('project title missing from user-format resume');
  }
  if (!latex.includes('Technologies: React 18, TypeScript, Vite, Supabase/PostgreSQL')) {
    throw new Error('technologies line missing from user-format resume');
  }
  if (latex.includes('\\item Technologies: React 18')) {
    throw new Error('technologies line incorrectly rendered as bullet');
  }
  if (!latex.includes('Built a unified GenAI application')) {
    throw new Error('achievement bullets missing from user-format resume');
  }
});

Deno.test('personal projects use bullet line directly above Technologies as title', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
- CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
Technologies: React 18, TypeScript, Vite
- Built an autonomous job-search workflow with Supabase and React.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('textbf{CareerPilot AI - Autonomous Job Search Platform | GenAI Developer \\& Forward Deployment Engineer}')) {
    throw new Error('bullet line above Technologies was not promoted to title');
  }
  if (latex.includes('\\item CareerPilot AI - Autonomous Job Search Platform')) {
    throw new Error('promoted project title still rendered as bullet');
  }
});

Deno.test('personal projects recover orphan title before section header', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
PERSONAL PROJECTS
- Technologies: React 18, TypeScript, Vite
- Built an autonomous job-search workflow with Supabase and React.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('textbf{CareerPilot AI - Autonomous Job Search Platform | GenAI Developer \\& Forward Deployment Engineer}')) {
    throw new Error('orphan title before PERSONAL PROJECTS was not recovered');
  }
});

Deno.test('personal projects render titles with textbf not bfseries groups', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
- Technologies: React 18, TypeScript, Vite
- Built an autonomous job-search workflow with Supabase and React.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('\\textbf{CareerPilot AI - Autonomous Job Search Platform | GenAI Developer \\& Forward Deployment Engineer}')) {
    throw new Error('project title not rendered with textbf');
  }
  if (latex.includes('{\\bfseries CareerPilot AI')) {
    throw new Error('project title still uses bfseries group that moderncv drops');
  }
});

Deno.test('personal projects split consecutive Technologies into separate projects', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
- Technologies: React 18, TypeScript, Vite, Supabase/PostgreSQL
- Technologies: React 19, TanStack Start, TypeScript 5.8, FFmpeg.wasm
- Technologies: React, TypeScript, Vite, Tailwind CSS, Supabase/PostgreSQL
- Built a unified GenAI application covering job discovery, ATS resume tailoring, cover letters, application tracking, and an AI Copilot.
- Implemented a career corpus with a master ATS bullet bank, 2-page resume template, 6 role playbooks, and tagged evidence chunks that select existing bullets while preserving metrics.
- Pic-Reel / FrameFlow Hyperlapse Tool | Solo GenAI Developer
- Built a privacy-first browser application that converts photo sequences to MP4 without uploading images to a server.
- Cric-Scorer / IPL 2026 Prediction App / PlanItX | Solo GenAI Developer
- Built Cric-Scorer with 3 deterministic domain engines and a 14-table Supabase schema for ball-by-ball scoring.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('textbf{CareerPilot AI - Autonomous Job Search Platform | GenAI Developer \\& Forward Deployment Engineer}')) {
    throw new Error('missing first project title');
  }
  if (!latex.includes('textbf{Pic-Reel / FrameFlow Hyperlapse Tool | Solo GenAI Developer}')) {
    throw new Error('missing second project title');
  }
  if (!latex.includes('textbf{Cric-Scorer / IPL 2026 Prediction App / PlanItX | Solo GenAI Developer}')) {
    throw new Error('missing third project title');
  }
  if (!latex.includes('React 19, TanStack Start, TypeScript 5.8, FFmpeg.wasm')) {
    throw new Error('missing second project technologies');
  }
  if (latex.includes('\\item Pic-Reel / FrameFlow Hyperlapse Tool')) {
    throw new Error('second project title rendered as bullet');
  }
  if (latex.includes('\\item CareerPilot AI - Autonomous Job Search Platform')) {
    throw new Error('first project title rendered as bullet');
  }
});

Deno.test('personal projects split on repeated Technologies lines', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
CareerPilot AI
Technologies: React 18, TypeScript
- Built CareerPilot.

Frames to Video
Technologies: React 19, FFmpeg.wasm
- Built a privacy-first video converter.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('CareerPilot AI')) throw new Error('missing first project title');
  if (!latex.includes('Frames to Video')) throw new Error('missing second project title');
  if (!latex.includes('React 19, FFmpeg.wasm')) throw new Error('missing second project technologies');
});

Deno.test('personal projects preserve full Technologies lines in PDF output', () => {
  const techLine = 'React 18, TypeScript, Vite, Supabase/PostgreSQL, Edge Functions/Deno, Gemini 3.6 Flash, Groq, Apify, Google Drive OAuth2, Resend, LaTeX, Render.com';
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer
Technologies: ${techLine}
- Built an autonomous job-search workflow with Supabase and React.

EDUCATION
B.S. Computer Science`;

  const classic = buildLatexFromAtsText(resume, { template: 'classic' });
  const twoCol = buildLatexFromAtsText(resume, { template: 'modern_two_column' });

  if (!classic.includes(techLine)) {
    throw new Error('classic template truncated Technologies line');
  }
  // The old bug cut the line at 72 chars, so the tail went missing entirely.
  // (Asserting on a 72-char prefix cannot work — it is a substring of the full line.)
  if (!classic.includes('Render.com')) {
    throw new Error('classic template still truncates the Technologies line');
  }
  if (!twoCol.includes(techLine)) {
    throw new Error('two-column template truncated Technologies line');
  }
  if (!classic.includes('CareerPilot AI - Autonomous Job Search Platform')) {
    throw new Error('classic template missing project title');
  }
});

Deno.test('buildLatexFromAtsText accepts markdown personal projects section', () => {
  const markdown = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

## Personal Projects
Side App
- Built a React dashboard.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(markdown, { template: 'classic' });
  if (!latex.includes('Side App')) throw new Error('markdown personal projects content missing');
});

Deno.test('project Type line renders as meta, not as an achievement bullet', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

SELECTED PROJECTS
CareerPilot AI | Solo Developer
- Type: Personal
- Technologies: React 18, TypeScript
- Built an autonomous job-search workflow.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('Type: Personal')) {
    throw new Error('Type line missing from classic template');
  }
  if (latex.includes('\\item Type: Personal')) {
    throw new Error('Type line was rendered as an achievement bullet');
  }
  // Type should read above Technologies.
  if (latex.indexOf('Type: Personal') > latex.indexOf('Technologies: React 18')) {
    throw new Error('Type line should precede the Technologies line');
  }
});

Deno.test('project Type lines stay with their own project across multiple projects', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

SELECTED PROJECTS
Billing Migration | Tech Lead
- Type: Official
- Technologies: Java, Kafka
- Moved billing onto an event-driven pipeline.

CareerPilot AI | Solo Developer
- Type: Personal
- Technologies: React 18, TypeScript
- Built an autonomous job-search workflow.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('Type: Official')) throw new Error('Official type missing');
  if (!latex.includes('Type: Personal')) throw new Error('Personal type missing');
  if (latex.includes('\\item Type:')) {
    throw new Error('a Type line was rendered as an achievement bullet');
  }
  // Each Type must sit inside its own project block, in source order.
  const officialAt = latex.indexOf('Type: Official');
  const personalAt = latex.indexOf('Type: Personal');
  const careerPilotAt = latex.indexOf('CareerPilot AI');
  if (!(officialAt < careerPilotAt && careerPilotAt < personalAt)) {
    throw new Error(`Type lines were reassigned across projects\n${latex}`);
  }
});

Deno.test('legacy PERSONAL PROJECTS plain-text header still renders as Selected Projects', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

PERSONAL PROJECTS
CareerPilot AI | Solo Developer
- Technologies: React 18, TypeScript
- Built an autonomous job-search workflow.

EDUCATION
B.S. Computer Science`;

  const latex = buildLatexFromAtsText(resume, { template: 'classic' });
  if (!latex.includes('\\section{Selected Projects}')) {
    throw new Error('legacy header did not render under the new section name');
  }
  if (!latex.includes('CareerPilot AI')) {
    throw new Error('legacy project content was dropped');
  }
});

function resumeWithContactLine(line: string): string {
  return `NAME
Jane Doe

CONTACT
Email: jane@example.com
Phone: +91 6380069156
Location: Chennai, Tamil Nadu
${line}
LinkedIn: https://linkedin.com/in/janedoe
GitHub: https://github.com/janedoe

SUMMARY
Engineer.

SKILLS
- TypeScript

PROFESSIONAL EXPERIENCE
ACME
- Shipped APIs.

EDUCATION
B.S. Computer Science`;
}

Deno.test('formatWebsiteLabel strips scheme, www, and trailing slash', () => {
  const cases: Array<[string, string]> = [
    ['https://janedoe.dev', 'janedoe.dev'],
    ['http://janedoe.dev', 'janedoe.dev'],
    ['www.janedoe.dev/', 'janedoe.dev'],
    ['janedoe.dev', 'janedoe.dev'],
    ['https://janedoe.dev/portfolio/', 'janedoe.dev/portfolio'],
  ];
  for (const [raw, expected] of cases) {
    const actual = formatWebsiteLabel(raw);
    if (actual !== expected) throw new Error(`${raw}: expected ${expected}, got ${actual}`);
  }
});

Deno.test('buildWebsiteUrl keeps an explicit scheme and defaults to https', () => {
  if (buildWebsiteUrl('http://janedoe.dev') !== 'http://janedoe.dev') {
    throw new Error('explicit http scheme was not preserved');
  }
  if (buildWebsiteUrl('janedoe.dev') !== 'https://janedoe.dev') {
    throw new Error('bare domain did not default to https');
  }
  if (buildWebsiteUrl('www.janedoe.dev/') !== 'https://janedoe.dev') {
    throw new Error('www/trailing slash not normalized');
  }
  if (buildWebsiteUrl('') !== '') throw new Error('empty input should stay empty');
});

Deno.test('Website contact line renders in moderncv templates without a doubled scheme', () => {
  for (const template of ['classic', 'modern_single'] as const) {
    const latex = buildLatexFromAtsText(resumeWithContactLine('Website: https://janedoe.dev'), { template });
    if (!latex.includes('\\homepage{janedoe.dev}')) {
      throw new Error(`${template} did not render \\homepage\n${latex}`);
    }
    // \homepage prepends the protocol itself; a full URL would double it.
    if (/http:\/\/https:|https:\/\/https:/.test(latex)) {
      throw new Error(`${template} produced a doubled URL scheme\n${latex}`);
    }
  }
});

Deno.test('Website contact line renders as a link in the two-column template', () => {
  const latex = buildLatexFromAtsText(resumeWithContactLine('Website: https://janedoe.dev'), {
    template: 'modern_two_column',
  });
  if (!latex.includes('\\href{https://janedoe.dev}{janedoe.dev}')) {
    throw new Error(`two-column template did not render the website link\n${latex}`);
  }
});

Deno.test('alternate website labels are all recognized', () => {
  for (const label of ['Website', 'Portfolio', 'Homepage', 'Site']) {
    const latex = buildLatexFromAtsText(resumeWithContactLine(`${label}: https://janedoe.dev`), {
      template: 'classic',
    });
    if (!latex.includes('\\homepage{janedoe.dev}')) {
      throw new Error(`${label}: was not recognized as a website`);
    }
  }
});

Deno.test('a resume with no website emits no homepage command', () => {
  const latex = buildLatexFromAtsText(resumeWithContactLine('Title: Staff Engineer'), {
    template: 'classic',
  });
  if (/\\homepage/.test(latex)) {
    throw new Error('emitted \\homepage for a resume with no website');
  }
  const twoCol = buildLatexFromAtsText(resumeWithContactLine('Title: Staff Engineer'), {
    template: 'modern_two_column',
  });
  // Contact block should still render the other fields.
  if (!twoCol.includes('jane@example.com')) {
    throw new Error('two-column contact block lost the email');
  }
});

/* Experience header detection — previously a four-employer whitelist, so a
   candidate at any other company lost their company line in the PDF. */

Deno.test('recognizes any employer as an experience header', () => {
  for (const line of [
    'ACME CORP | Staff Engineer',
    'Google | Senior SWE',
    'Stripe | Payments Engineer',
    'Kleine & Schmidt GmbH | Consultant',
    'PALO ALTO NETWORKS | Integration Architect',
  ]) {
    if (!isExperienceHeaderLine(line)) throw new Error(`not detected as a header: ${line}`);
  }
});

Deno.test('still recognizes the labels the old whitelist covered', () => {
  for (const line of ['LEADERSHIP', 'SECURITY', 'CRITICAL', 'TCS', 'INFOSYS', 'PROJECT: Atlas']) {
    if (!isExperienceHeaderLine(line)) throw new Error(`regressed on: ${line}`);
  }
});

Deno.test('does not treat a date/location line as an experience header', () => {
  // This is the line directly below the company header in the output contract.
  for (const line of [
    'Jan 2020 - Present | Bengaluru, India',
    '2019 - 2021 | Remote',
    'Jul 2024 | San Francisco, CA',
  ]) {
    if (isExperienceHeaderLine(line)) throw new Error(`date line misread as a header: ${line}`);
  }
});

Deno.test('does not treat prose or bullets as an experience header', () => {
  for (const line of [
    'Built a distributed ingestion pipeline handling 4M events per day across regions.',
    'Reduced p95 latency from 800ms to 120ms',
    'Technologies: Go, Kafka, Kubernetes',
    '',
    '   ',
  ]) {
    if (isExperienceHeaderLine(line)) throw new Error(`misread as a header: ${line}`);
  }
});

Deno.test('a non-whitelisted employer keeps its company line in the PDF', () => {
  const resume = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
I build systems.

SKILLS
Cloud:
- AWS, GCP

PROFESSIONAL EXPERIENCE
STRIPE | Senior Payments Engineer
Jan 2021 - Present | Dublin, Ireland
- Shipped a ledger reconciliation service handling 2M transactions a day.

EDUCATION
- B.S. in Computer Science, State University`;

  for (const template of ['classic', 'modern_single', 'modern_two_column'] as const) {
    const latex = buildLatexFromAtsText(resume, { template });
    if (!latex.includes('Stripe') && !latex.includes('STRIPE')) {
      throw new Error(`${template}: employer name missing from the PDF`);
    }
    if (!latex.includes('Senior Payments Engineer')) {
      throw new Error(`${template}: role missing from the PDF`);
    }
  }
});
