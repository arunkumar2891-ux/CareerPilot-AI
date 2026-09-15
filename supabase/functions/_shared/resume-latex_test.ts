import {
  buildGitHubUrl,
  buildLatexFromAtsText,
  buildLinkedInUrl,
  extractGitHubHandle,
  extractLinkedInHandle,
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
  if (!normalized.includes('PERSONAL PROJECTS')) throw new Error('missing PERSONAL PROJECTS header');
  if (!normalized.includes('SUMMARY')) throw new Error('missing SUMMARY header');
});

Deno.test('buildLatexFromAtsText includes Personal Projects in classic template', () => {
  const latex = buildLatexFromAtsText(SAMPLE_RESUME, { template: 'classic' });
  if (!latex.includes('\\section{Personal Projects}')) {
    throw new Error('classic template missing Personal Projects section');
  }
  if (!latex.includes('CareerPilot AI')) {
    throw new Error('classic template missing project content');
  }
});

Deno.test('buildLatexFromAtsText includes Personal Projects in modern templates', () => {
  const single = buildLatexFromAtsText(SAMPLE_RESUME, { template: 'modern_single' });
  const twoCol = buildLatexFromAtsText(SAMPLE_RESUME, { template: 'modern_two_column' });

  if (!single.includes('\\section{Personal Projects}')) {
    throw new Error('modern_single missing Personal Projects section');
  }
  if (!twoCol.includes('\\textbf{Personal Projects}')) {
    throw new Error('modern_two_column missing Personal Projects section');
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
  if (!latex.includes('CareerPilot AI - Autonomous Job Search Platform | GenAI Developer & Forward Deployment Engineer')) {
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
  if (classic.includes('Edge Functions/Deno, Ge')) {
    throw new Error('classic template still shows 72-char Technologies truncation');
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
