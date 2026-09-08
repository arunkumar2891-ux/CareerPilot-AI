/** Keep ATS prompts bounded — full master bank in DB can be 50k+ chars and slow Gemini. */
export function trimForAts(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[${label} truncated for ATS — select bullets from the text above only]`;
}

export const ATS_SYSTEM_PROMPT = `You write resumes that sound like a senior engineer wrote them after a careful edit — not like a language model.

VOICE (must read as human):
- Prefer copying bullets from the source bank with small edits: cut fluff, drop a clause, or change order. Do not rewrite every sentence into a new generic template.
- Vary sentence length. Mix short facts with one longer technical sentence. Avoid starting several bullets the same way.
- Do not use these phrases: results-driven, proven track record, passionate, leveraged, spearheaded, demonstrated ability, highly skilled, cutting-edge, seamless, robust ecosystem, utilizing, furthermore, additionally, in order to, played a key role.
- Do not use em dashes or en dashes as separators.
- Do not keyword-stuff. Mention JD tools only where they already appear in the source.

CONTENT CONTRACT:
- The BULLET CATALOG and supplied source blocks are the only factual sources. Do not invent companies, titles, tools, skills, metrics, dates, certifications, education, or contact details.
- Select relevant source bullets and lightly edit them. Do not combine two bullets into a claim neither supports.
- Every number must appear in the supplied source.
- RERANKED SELECTION lists bullet IDs in priority order. Prefer those bullets, but print no IDs.
- Lead with projects that match the job. Keep 4-6 bullets per project and about 14-18 experience bullets total.
- Reorder the compact TEMPLATE SKILLS for the JD. Include only relevant skill lines; never copy the full Master ATS taxonomy.
- Target TWO PAGES. Treat the 2-page template as the structure and length budget, not merely a reference.
- Fill NAME and CONTACT from the supplied contact block. Keep contact labels.
- Write a 3-5 sentence SUMMARY using source facts. Do not open with the target title as a slogan.
- Never write that the resume was tailored, optimized, generated, or customized.
- Never include ATS keyword reference lines, tailoring-guide text, RECTIFICATION & ITERATION, or section instructions.

Final Output (STRICT):
Return ONLY plain text. No Markdown. No preamble.
Use ONLY these section headers (ALL CAPS), in this exact order: NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION
For bullets use: - (hyphen + space)
Each section header may appear exactly once. SKILLS and EDUCATION must never be empty. Include CERTIFICATION when the source lists certifications; omit the section when none exist.
Do not use === separators, PROFESSIONAL SUMMARY, EXECUTIVE SUMMARY, TECHNICAL SKILLS, or CORE COMPETENCIES as headers.

OUTPUT SKELETON (use exactly these headers once each, in this order):
NAME
<full name from catalog>

CONTACT
<email, phone, location, linkedin, github from catalog>

SUMMARY
<3-5 concise sentences grounded in the supplied source>

SKILLS
<compact skill lines from TEMPLATE SKILLS, selected and ordered for the JD>

PROFESSIONAL EXPERIENCE
<company/project headers from source>
<selected source bullets with light edits — keep metrics and employers unchanged>

CERTIFICATION
<certifications from TEMPLATE CERTIFICATION, or omit this section if none exist>

EDUCATION
<education from TEMPLATE EDUCATION>`;

export const ROLE_BANK_SYSTEM_PROMPT = `You write a comprehensive, role-focused resume from a Master ATS bullet bank.

VOICE (must read as human):
- Prefer copying bullets from the source bank with small edits: cut fluff, drop a clause, or change order. Do not rewrite every sentence into a new generic template.
- Vary sentence length. Mix short facts with one longer technical sentence. Avoid starting several bullets the same way.
- Do not use these phrases: results-driven, proven track record, passionate, leveraged, spearheaded, demonstrated ability, highly skilled, cutting-edge, seamless, robust ecosystem, utilizing, furthermore, additionally, in order to, played a key role.
- Do not use em dashes or en dashes as separators.

CONTENT CONTRACT:
- The MASTER ATS is the only factual source. Do not invent companies, titles, tools, skills, metrics, dates, certifications, education, or contact details.
- Include ALL relevant achievements and bullets from the Master ATS for this role family. This is a corpus document, not a two-page tailored resume — prefer completeness over brevity.
- Every number must appear in the supplied source.
- Lead with projects that match the role. Keep company and project structure from the source.
- Reorder skills for this role. Do not invent skills.
- Fill NAME and CONTACT from the supplied contact block. Keep contact labels.
- Write a 3-5 sentence SUMMARY using source facts, oriented to this role.
- Include CERTIFICATION when the source lists certifications; omit the section when none exist.
- Never write that the resume was tailored, optimized, generated, or customized.
- Never include ATS keyword reference lines, tailoring-guide text, RECTIFICATION & ITERATION, or section instructions.

Final Output (STRICT):
Return ONLY plain text. No Markdown. No preamble.
Use ONLY these section headers (ALL CAPS), in this exact order: NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION
For bullets use: - (hyphen + space)
Each section header may appear exactly once. SKILLS and EDUCATION must never be empty.
Do not use === separators, PROFESSIONAL SUMMARY, EXECUTIVE SUMMARY, TECHNICAL SKILLS, or CORE COMPETENCIES as headers.`;

export function buildResumeUserPrompt(input: {
  jobTitle?: string;
  company?: string;
  jobDescription: string;
  playbookTitle?: string;
  playbookInstructions?: string;
  masterResume: string;
  twoPageTemplate: string;
  bulletCatalog: string;
  retrievedEvidence: string;
  rerankedSelection: string;
  lexicalMatches?: string;
  contactBlock: string;
  googleHeader?: string;
  skillsSource?: string;
  educationSource?: string;
  certificationSource?: string;
  summarySource?: string;
}): string {
  const jobDescription = trimForAts(input.jobDescription, 8000, 'Job description');
  const twoPageTemplate = trimForAts(input.twoPageTemplate, 8000, '2-page template');
  const masterResume = trimForAts(input.masterResume, 24000, 'Master ATS resume');
  const lexicalMatches = trimForAts(input.lexicalMatches || '', 8000, 'Lexically matched master excerpts');
  const bulletCatalog = trimForAts(input.bulletCatalog, 12000, 'Bullet catalog');
  const retrievedEvidence = trimForAts(input.retrievedEvidence, 4000, 'Retrieved evidence');
  const skillsSource = trimForAts(input.skillsSource || '', 4000, 'Required skills source');
  const educationSource = trimForAts(input.educationSource || '', 1200, 'Required education source');
  const certificationSource = trimForAts(input.certificationSource || '', 1200, 'Required certification source');

  return [
    `TARGET ROLE: ${input.jobTitle || '(unknown)'} at ${input.company || '(unknown)'}`,
    `Focus: select and lightly edit existing bullets that match this posting. Do not invent a new career story.`,
    `MATCHED PLAYBOOK: ${input.playbookTitle || 'none — infer from JD'}`,
    input.playbookInstructions ? `PLAYBOOK INSTRUCTIONS:\n${input.playbookInstructions}` : '',
    `JOB DESCRIPTION:\n${jobDescription}`,
    input.contactBlock ? `CONTACT (copy these labeled values into NAME and CONTACT):\n${input.contactBlock}` : '',
    input.googleHeader ? `GOOGLE DOC HEADER OVERRIDE (do not add facts unless present in catalog):\n${input.googleHeader}` : '',
    `2-PAGE TEMPLATE (required structure and length budget):\n${twoPageTemplate}`,
    skillsSource ? `TEMPLATE SKILLS (select and order compact lines for the JD):\n${skillsSource}` : '',
    educationSource ? `TEMPLATE EDUCATION (copy into EDUCATION; do not replace):\n${educationSource}` : '',
    certificationSource ? `TEMPLATE CERTIFICATION (copy into CERTIFICATION; omit the section if empty):\n${certificationSource}` : '',
    input.rerankedSelection,
    input.retrievedEvidence,
    bulletCatalog,
    `ROLE-FOCUSED SOURCE BANK (select relevant experience; do not dump it):\n${masterResume}`,
    lexicalMatches ? `LEXICALLY MATCHED MASTER EXCERPTS:\n${lexicalMatches}` : '',
  ].filter(Boolean).join('\n\n');
}

/** Compact prompt for Groq fallback — fits TPM limits while keeping catalog + mandatory sections. */
export function buildGroqResumeUserPrompt(input: {
  jobTitle?: string;
  company?: string;
  jobDescription: string;
  bulletCatalog: string;
  retrievedEvidence?: string;
  rerankedSelection: string;
  contactBlock?: string;
  skillsSource?: string;
  educationSource?: string;
  certificationSource?: string;
  summarySource?: string;
}): string {
  const jobDescription = trimForAts(input.jobDescription, 2500, 'Job description');
  const bulletCatalog = trimForAts(input.bulletCatalog, 8000, 'Bullet catalog');
  const skillsSource = trimForAts(input.skillsSource || '', 2500, 'Required skills source');
  const educationSource = trimForAts(input.educationSource || '', 800, 'Required education source');
  const certificationSource = trimForAts(input.certificationSource || '', 800, 'Required certification source');
  const retrievedEvidence = trimForAts(input.retrievedEvidence || '', 1500, 'Retrieved evidence');
  const summarySource = trimForAts(input.summarySource || '', 800, 'Summary source');

  return [
    `TARGET ROLE: ${input.jobTitle || '(unknown)'} at ${input.company || '(unknown)'}`,
    `Keep the 7-header contract: two-page resume, source bullets with light edits, compact skills, and section order NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION.`,
    `JOB DESCRIPTION (excerpt):\n${jobDescription}`,
    input.contactBlock ? `CONTACT (copy labeled values):\n${input.contactBlock}` : '',
    summarySource ? `SUMMARY SOURCE (rewrite once under SUMMARY to match the JD; keep the facts):\n${summarySource}` : '',
    skillsSource ? `TEMPLATE SKILLS (select compact relevant lines; do not expand):\n${skillsSource}` : '',
    educationSource ? `TEMPLATE EDUCATION (copy; do not replace):\n${educationSource}` : '',
    certificationSource ? `TEMPLATE CERTIFICATION (copy; omit if empty):\n${certificationSource}` : '',
    input.rerankedSelection,
    retrievedEvidence,
    bulletCatalog,
  ].filter(Boolean).join('\n\n');
}

export function buildRoleBankUserPrompt(input: {
  playbookTitle: string;
  playbookInstructions: string;
  masterResume: string;
  contactBlock: string;
  skillsSource?: string;
  educationSource?: string;
  certificationSource?: string;
  summarySource?: string;
}): string {
  const masterResume = trimForAts(input.masterResume, 40000, 'Master ATS resume');
  const skillsSource = trimForAts(input.skillsSource || '', 4000, 'Skills source');
  const educationSource = trimForAts(input.educationSource || '', 1200, 'Education source');
  const certificationSource = trimForAts(input.certificationSource || '', 1200, 'Certification source');
  const summarySource = trimForAts(input.summarySource || '', 1400, 'Summary source');

  return [
    `TARGET ROLE FAMILY: ${input.playbookTitle}`,
    `The MASTER ATS is the source of truth for every fact. Produce a comprehensive role-focused resume — include all relevant achievements and bullets, not a two-page trim.`,
    input.playbookInstructions ? `PLAYBOOK INSTRUCTIONS:\n${input.playbookInstructions}` : '',
    input.contactBlock ? `CONTACT (copy these labeled values into NAME and CONTACT):\n${input.contactBlock}` : '',
    summarySource ? `SUMMARY SOURCE (rewrite once under SUMMARY for this role; keep the facts):\n${summarySource}` : '',
    skillsSource ? `SKILLS SOURCE (select and order for this role; do not invent):\n${skillsSource}` : '',
    certificationSource ? `CERTIFICATION SOURCE (copy into CERTIFICATION; omit the section if empty):\n${certificationSource}` : '',
    educationSource ? `EDUCATION SOURCE (copy into EDUCATION; do not replace):\n${educationSource}` : '',
    `MASTER ATS (source of truth):\n${masterResume}`,
  ].filter(Boolean).join('\n\n');
}

const RETRIEVAL_STOP_WORDS = new Set([
  'about', 'after', 'among', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'you', 'your',
]);

export function retrievalTerms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z0-9+#./-]{3,}/g) || [])
    .filter((term) => !RETRIEVAL_STOP_WORDS.has(term)))];
}

/**
 * Lexical half of the hybrid retriever. Role playbooks provide the curated/semantic
 * half; this picks additional master-resume blocks that use the JD's terminology.
 */
export function selectLexicalMasterMatches(masterResume: string, jobDescription: string, limit = 8): string {
  const terms = retrievalTerms(jobDescription);
  if (!terms.length) return '';

  return masterResume
    .split(/\n\s*\n/)
    .map((block, index) => {
      const haystack = block.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { block: block.trim(), index, score };
    })
    .filter((entry) => entry.block.length > 30 && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.block)
    .join('\n\n');
}

export function pickPlaybook(
  jd: string,
  playbooks: readonly {
    id: string;
    title: string;
    matchKeywords: readonly string[];
    leadWith: readonly string[];
    emphasize: readonly string[];
    highlight: readonly string[];
    deemphasize?: string;
  }[],
) {
  const hay = jd.toLowerCase();
  let best = playbooks[0];
  let bestScore = -1;
  for (const p of playbooks) {
    const score = p.matchKeywords.reduce((n, k) => n + (hay.includes(k.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return { playbook: best, score: bestScore };
}

export function playbookInstructions(p: {
  title: string;
  leadWith: readonly string[];
  emphasize: readonly string[];
  highlight: readonly string[];
  deemphasize?: string;
}): string {
  return [
    `Lead with: ${p.leadWith.join('; ')}`,
    `Emphasize: ${p.emphasize.join(', ')}`,
    `Must keep these facts: ${p.highlight.join('; ')}`,
    p.deemphasize ? `De-emphasize: ${p.deemphasize}` : '',
  ].filter(Boolean).join('\n');
}

export function formatContact(contact: Record<string, string | undefined>): string {
  return [
    contact.fullName && `Name: ${contact.fullName}`,
    contact.title && `Title: ${contact.title}`,
    contact.email && `Email: ${contact.email}`,
    contact.phone && `Phone: ${contact.phone}`,
    contact.location && `Location: ${contact.location}`,
    contact.linkedin && `LinkedIn: ${contact.linkedin}`,
    contact.github && `GitHub: ${contact.github}`,
    contact.startDate && `PANW start: ${contact.startDate}`,
  ].filter(Boolean).join('\n');
}

export const DEFAULT_EDUCATION = `B.Tech in Information Technology
SASTRA University | Thanjavur`;

export function replaceEducationPlaceholders(text: string): string {
  let out = text;
  out = out.replace(
    /\[Degree Name\][^\n]*\n\[University Name\][^\n]*(?:\n\[Graduation Year\][^\n]*)?/g,
    DEFAULT_EDUCATION,
  );
  out = out.replace(
    /Bachelor of Engineering in Computer Science\s*\n\s*Anna University[^\n]*/gi,
    DEFAULT_EDUCATION,
  );
  return out;
}

export function applyContactOverlay(
  text: string,
  contact: Record<string, string | undefined>,
): string {
  let out = text;
  const replacements: [string, string | undefined][] = [
    ['[City, State]', contact.location],
    ['[Location]', contact.location],
    ['[Phone Number]', contact.phone],
    ['[Email Address]', contact.email],
    ['[LinkedIn URL]', contact.linkedin],
    ['[GitHub URL]', contact.github],
    ['[Start Date]', contact.startDate],
  ];
  for (const [token, value] of replacements) {
    if (value) out = out.split(token).join(value);
  }
  const headerLines: [string, string | undefined][] = [
    ['Location', contact.location],
    ['Phone', contact.phone],
    ['Email', contact.email],
    ['LinkedIn', contact.linkedin],
    ['GitHub', contact.github],
  ];
  for (const [label, value] of headerLines) {
    if (!value) continue;
    out = out.replace(new RegExp(`^${label}:.*$`, 'm'), `${label}: ${value}`);
  }
  if (contact.fullName) out = out.replace(/^ARUN KUMAR/m, contact.fullName.toUpperCase());
  return replaceEducationPlaceholders(out);
}

export function selectEvidence(
  jd: string,
  chunks: readonly { id: string; tags: readonly string[]; text: string }[],
  limit = 8,
): { id: string; tags: string[]; text: string }[] {
  const hay = jd.toLowerCase();
  return [...chunks]
    .map((c) => ({
      c,
      score: c.tags.reduce((n, t) => n + (hay.includes(t.replace(/_/g, ' ')) || hay.includes(t) ? 1 : 0), 0)
        + (hay.split(/\s+/).filter((w) => w.length > 3 && c.text.toLowerCase().includes(w)).length > 0 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ id: x.c.id, tags: [...x.c.tags], text: x.c.text }));
}
