/** Keep ATS prompts bounded — full master bank in DB can be 50k+ chars and slow Gemini. */
export function trimForAts(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[${label} truncated for ATS — select bullets from the text above only]`;
}

export const ATS_SYSTEM_PROMPT = `You write resumes that sound like a senior engineer wrote them after a careful edit — not like a language model.

SOURCE-LOCKED CONTENT RULES:
- The MASTER ATS RESUME is the only factual source. The role bank and lexical excerpts are retrieval aids from that same source, not permission to add facts.
- Copy every non-heading line verbatim from the MASTER ATS RESUME. You may select, omit, and reorder complete lines and bullets, but never paraphrase, combine, split, or rewrite them.
- Do not invent or infer companies, titles, tools, skills, metrics, dates, certifications, education, responsibilities, locations, or contact details. Do not add a JD keyword unless it already appears verbatim in the master source.
- Use the existing PROFESSIONAL SUMMARY verbatim once; do not write an executive summary or any second summary.
- Use 4-6 existing bullets per included project. Preserve every selected bullet exactly.
- Reorder existing skill lines only; do not add skills or keyword-stuff.
- Use the 2-page template only as a length target. It is not a factual source.
- Never write that the resume was tailored, optimized, generated, or customized for a company. Never mention prompts, ATS, playbooks, RAG, or this instruction set.

Final Output (STRICT):
Return ONLY plain text. No Markdown. No preamble.
Use ONLY these section headers (ALL CAPS): NAME, CONTACT, SUMMARY, PROFESSIONAL EXPERIENCE, EDUCATION, SKILLS
For bullets use: - (hyphen + space)
Each section header may appear exactly once. Do not include PROFESSIONAL SUMMARY, EXECUTIVE SUMMARY, or any other summary heading.
Under every section, copy complete source lines only. Do not add labels such as "Name:" or "Title:" unless the exact label is present in the source.`;

export function buildResumeUserPrompt(input: {
  jobTitle?: string;
  company?: string;
  jobDescription: string;
  playbookTitle?: string;
  playbookInstructions?: string;
  masterResume: string;
  twoPageTemplate: string;
  evidence: string;
  lexicalMatches?: string;
  contactBlock: string;
  googleHeader?: string;
}): string {
  const jobDescription = trimForAts(input.jobDescription, 8000, 'Job description');
  const twoPageTemplate = trimForAts(input.twoPageTemplate, 8000, '2-page template');
  const masterResume = trimForAts(input.masterResume, 24000, 'Master ATS resume');
  const lexicalMatches = trimForAts(input.lexicalMatches || '', 8000, 'Lexically matched master excerpts');

  return [
    `TARGET ROLE: ${input.jobTitle || '(unknown)'} at ${input.company || '(unknown)'}`,
    `Retrieval strategy: semantic role-bank selection plus lexical matching against the same master source. Select complete source lines only; do not create a new career story.`,
    `MATCHED PLAYBOOK: ${input.playbookTitle || 'none — infer from JD'}`,
    input.playbookInstructions ? `PLAYBOOK INSTRUCTIONS:\n${input.playbookInstructions}` : '',
    `JOB DESCRIPTION:\n${jobDescription}`,
    input.contactBlock ? `CONTACT VALUES (only use values that also appear in the master source):\n${input.contactBlock}` : '',
    input.googleHeader ? `GOOGLE DOC HEADER OVERRIDE (do not add facts from this unless present in the master source):\n${input.googleHeader}` : '',
    `2-PAGE TEMPLATE (length/layout target):\n${twoPageTemplate}`,
    `SEMANTIC ROLE BANK (retrieved from the master source):\n${masterResume}`,
    lexicalMatches ? `LEXICALLY MATCHED MASTER EXCERPTS (also retrieved from the master source):\n${lexicalMatches}` : '',
    `MASTER-ONLY POLICY: EVIDENCE CHUNKS and the job description may guide selection, but neither is an allowed factual source for the final resume.`,
  ].filter(Boolean).join('\n\n');
}

const RETRIEVAL_STOP_WORDS = new Set([
  'about', 'after', 'among', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'you', 'your',
]);

function retrievalTerms(text: string): string[] {
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
