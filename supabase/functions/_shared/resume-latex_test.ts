import { buildLatexFromAtsText, normalizeResumeTextForPdf } from './resume-latex.ts';

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
