/** Keep ATS prompts bounded — full master bank in DB can be 50k+ chars and slow Gemini. */
export function trimForAts(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[${label} truncated for ATS — select bullets from the text above only]`;
}

export const ATS_SYSTEM_PROMPT = `You are an expert ATS resume optimizer for Arun Kumar.

RULES (non-negotiable):
- SELECT and lightly rewrite bullets that already exist in the MASTER BULLET BANK. Do not invent companies, titles, tools, or metrics.
- Every number in the output must appear in the master bank or EVIDENCE CHUNKS (e.g. 66%, 278 to 94, 4-10x, 100+ users).
- Detect the closest ROLE PLAYBOOK from the job description. Lead with the projects listed in that playbook.
- Keep 4-6 bullets per project. Drop the rest. Reorder projects by JD relevance.
- Reorder SKILLS so JD technologies appear first. Use ATS keywords naturally — no stuffing.
- Target TWO PAGES. Use the 2-page template as the length/layout target.
- Fill CONTACT from the CONTACT block provided. Never leave [Email Address] or similar placeholders.
- If a Google Doc header is provided, use it only for name/contact override.

Final Output (STRICT):
Return ONLY plain text. No Markdown. No preamble.
Use ONLY these section headers (ALL CAPS): NAME, CONTACT, SUMMARY, PROFESSIONAL EXPERIENCE, EDUCATION, SKILLS
For bullets use: - (hyphen + space)`;

export function buildResumeUserPrompt(input: {
  jobTitle?: string;
  company?: string;
  jobDescription: string;
  playbookTitle?: string;
  playbookInstructions?: string;
  masterResume: string;
  twoPageTemplate: string;
  evidence: string;
  contactBlock: string;
  googleHeader?: string;
}): string {
  const jobDescription = trimForAts(input.jobDescription, 8000, 'Job description');
  const twoPageTemplate = trimForAts(input.twoPageTemplate, 8000, '2-page template');
  const masterResume = trimForAts(input.masterResume, 32000, 'Master bullet bank');

  return [
    `TARGET ROLE: ${input.jobTitle || '(unknown)'} at ${input.company || '(unknown)'}`,
    `MATCHED PLAYBOOK: ${input.playbookTitle || 'none — infer from JD'}`,
    input.playbookInstructions ? `PLAYBOOK INSTRUCTIONS:\n${input.playbookInstructions}` : '',
    `JOB DESCRIPTION:\n${jobDescription}`,
    input.contactBlock ? `CONTACT:\n${input.contactBlock}` : '',
    input.googleHeader ? `GOOGLE DOC HEADER OVERRIDE:\n${input.googleHeader}` : '',
    `2-PAGE TEMPLATE (length/layout target):\n${twoPageTemplate}`,
    `MASTER BULLET BANK (source of truth — select from these bullets only):\n${masterResume}`,
    input.evidence ? `EVIDENCE CHUNKS (allowed metrics only):\n${input.evidence}` : '',
  ].filter(Boolean).join('\n\n');
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
  return out;
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
