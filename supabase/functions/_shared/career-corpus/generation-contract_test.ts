import { assembleSourceLockedResume } from './assemble-source-locked-resume.ts';
import { ATS_SYSTEM_PROMPT, buildResumeUserPrompt } from './prompt.ts';
import { extractMandatoryResumeSections } from './resume-bank.ts';
import { validateResumeOutput } from '../ai/validate-resume.ts';
import { buildLatexFromAtsText } from '../resume-latex.ts';

Deno.test('resume prompt preserves the September 4 two-page selection contract', () => {
  if (!ATS_SYSTEM_PROMPT.includes('Prefer copying bullets')) {
    throw new Error('prompt must prefer selecting and lightly editing source bullets');
  }
  if (!ATS_SYSTEM_PROMPT.includes('Target TWO PAGES')) {
    throw new Error('prompt must enforce the two-page target');
  }

  const prompt = buildResumeUserPrompt({
    jobTitle: 'Forward Deployed Engineer',
    company: 'DevRev',
    jobDescription: 'Build customer-facing integrations.',
    masterResume: 'MASTER SOURCE',
    twoPageTemplate: 'TWO PAGE STRUCTURE',
    bulletCatalog: 'B001: Built APIs.',
    retrievedEvidence: '',
    rerankedSelection: 'B001',
    contactBlock: 'Name: Jane Doe',
  });
  const templateAt = prompt.indexOf('TWO PAGE STRUCTURE');
  const masterAt = prompt.indexOf('MASTER SOURCE');
  if (templateAt < 0 || masterAt < 0 || templateAt > masterAt) {
    throw new Error('two-page template must precede the larger source bank');
  }
});

Deno.test('two-page template provides compact mandatory skills and education', () => {
  const template = `PROFESSIONAL SUMMARY
Compact job-focused summary.

TECHNICAL SKILLS
Languages: TypeScript, Python
Cloud: GCP, Kubernetes

PROFESSIONAL EXPERIENCE
Acme
- Built APIs.

EDUCATION
B.Tech in Information Technology
SASTRA University

CERTIFICATIONS
- Example`;
  const sections = extractMandatoryResumeSections(template, ['TypeScript', 'GCP']);
  if (!sections.skills.includes('Languages: TypeScript, Python')) throw new Error(sections.skills);
  if (sections.skills.includes('PROFESSIONAL EXPERIENCE')) throw new Error(sections.skills);
  if (!sections.education.includes('SASTRA University')) throw new Error(sections.education);
  if (sections.education.includes('CERTIFICATIONS')) throw new Error(sections.education);
});

Deno.test('deterministic resume keeps labeled contact fields and September 4 section order', () => {
  const resume = assembleSourceLockedResume({
    contactBlock: `Name: Jane Doe
Title: Forward Deployed Engineer
Email: jane@example.com
Phone: +1 555 0100
Location: Chennai
LinkedIn: https://linkedin.com/in/jane`,
    summarySource: 'Senior engineer with more than ten years of customer-facing delivery experience.',
    skillsSource: 'Languages: TypeScript, Python',
    educationSource: 'B.Tech in Information Technology',
    rerankedBulletIds: ['B003'],
    catalog: [
      { id: 'B001', text: 'Jane Doe', isBullet: false, normalized: 'jane doe' },
      { id: 'B002', text: 'Acme', isBullet: false, normalized: 'acme' },
      { id: 'B003', text: 'Built customer-facing APIs for production systems.', isBullet: true, normalized: 'built customer-facing apis for production systems' },
    ],
  });

  for (const field of ['Title:', 'Email:', 'Phone:', 'Location:', 'LinkedIn:']) {
    if (!resume.includes(field)) throw new Error(`missing labeled contact field ${field}\n${resume}`);
  }
  const experienceAt = resume.indexOf('PROFESSIONAL EXPERIENCE');
  const skillsAt = resume.indexOf('SKILLS');
  const educationAt = resume.indexOf('EDUCATION');
  if (!(experienceAt < skillsAt && skillsAt < educationAt)) {
    throw new Error(`wrong section order\n${resume}`);
  }

  const latex = buildLatexFromAtsText(resume);
  if (!latex.includes('\\email{jane@example.com}') || !latex.includes('\\phone[mobile]{+1 555 0100}')) {
    throw new Error(`labeled contact fields did not reach PDF renderer\n${latex}`);
  }
  if (!(latex.indexOf('\\section{Professional Experience}') < latex.indexOf('\\section{Skills}'))) {
    throw new Error(`PDF renderer changed September 4 section order\n${latex}`);
  }
});

Deno.test('validator rejects Master ATS dumps that violate the two-page contract', () => {
  const bloated = `NAME
Jane Doe

CONTACT
Email: jane@example.com

SUMMARY
Senior engineer with customer-facing delivery experience.

PROFESSIONAL EXPERIENCE
RECTIFICATION & ITERATION:
${Array.from({ length: 30 }, (_, index) => `- Built production system ${index + 1} for enterprise users.`).join('\n')}

SKILLS
${Array.from({ length: 20 }, (_, index) => `Category ${index + 1}: TypeScript, Python, GCP`).join('\n')}

EDUCATION
B.Tech in Information Technology`;

  const result = validateResumeOutput(bloated, { skipGrounding: true });
  if (result.ok) throw new Error('expected Master ATS dump to fail the two-page contract');
});

Deno.test('deterministic fallback drops Master ATS artifact headers', () => {
  const resume = assembleSourceLockedResume({
    contactBlock: 'Name: Jane Doe\nEmail: jane@example.com',
    summarySource: 'Senior engineer with more than ten years of customer-facing delivery experience.',
    skillsSource: 'Languages: TypeScript, Python',
    educationSource: 'B.Tech in Information Technology',
    rerankedBulletIds: ['B003'],
    catalog: [
      { id: 'B001', text: 'RECTIFICATION & ITERATION:', isBullet: false, normalized: 'rectification & iteration:' },
      { id: 'B002', text: 'A long source paragraph that is deliberately not an experience header because it describes supporting context for the selected production achievement.', isBullet: false, normalized: 'a long source paragraph that is deliberately not an experience header because it describes supporting context for the selected production achievement' },
      { id: 'B003', text: 'Built customer-facing APIs for production systems.', isBullet: true, normalized: 'built customer-facing apis for production systems' },
    ],
  });
  if (resume.includes('RECTIFICATION & ITERATION')) {
    throw new Error(`artifact leaked into deterministic resume:\n${resume}`);
  }
  const result = validateResumeOutput(resume, { skipGrounding: true });
  if (!result.ok) throw new Error(`deterministic resume should validate: ${result.reason}\n${resume}`);
});

Deno.test('deterministic fallback caps experience at 18 selected bullets', () => {
  const catalog = [
    { id: 'H001', text: 'PALO ALTO NETWORKS', isBullet: false, normalized: 'palo alto networks' },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `B${String(index + 1).padStart(3, '0')}`,
      text: `Built production integration capability number ${index + 1}.`,
      isBullet: true,
      normalized: `built production integration capability number ${index + 1}`,
    })),
  ];
  const resume = assembleSourceLockedResume({
    contactBlock: 'Name: Jane Doe\nEmail: jane@example.com',
    summarySource: 'Senior engineer with more than ten years of customer-facing delivery experience.',
    skillsSource: 'Languages: TypeScript, Python',
    educationSource: 'B.Tech in Information Technology',
    rerankedBulletIds: catalog.filter((line) => line.isBullet).map((line) => line.id),
    catalog,
  });
  const bullets = resume.split('\n').filter((line) => line.startsWith('- '));
  if (bullets.length !== 18) throw new Error(`expected 18 bullets, got ${bullets.length}`);
  const result = validateResumeOutput(resume, { skipGrounding: true });
  if (!result.ok) throw new Error(`capped deterministic resume should validate: ${result.reason}`);
});
