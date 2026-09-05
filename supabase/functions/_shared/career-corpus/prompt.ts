/** Keep ATS prompts bounded — full master bank in DB can be 50k+ chars and slow Gemini. */
export function trimForAts(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[${label} truncated for ATS — select bullets from the text above only]`;
}

export const ATS_SYSTEM_PROMPT = `You write resumes that sound like a senior engineer wrote them after a careful edit — not like a language model.

VOICE (must read as human):
- Prefer copying bullets from the MASTER BULLET BANK with small edits (cut fluff, drop a clause, swap order). Do not rewrite every sentence into a new "perfect" template.
- Vary sentence length. Mix short facts with one longer technical sentence. Avoid starting several bullets the same way.
- Do not use these phrases: results-driven, proven track record, passionate, leveraged, spearheaded, demonstrated ability, highly skilled, cutting-edge, seamless, robust ecosystem, utilizing, furthermore, additionally, in order to, played a key role.
- Do not use em dashes, en dashes as separators, or stacked adjectives like "scalable, resilient, enterprise-grade".
- Do not keyword-stuff. Mention JD tools only where they already appear in the bank or evidence.
- Never write that the resume was tailored, optimized, generated, or customized for a company.
- Never mention AI, prompts, ATS, playbooks, or this instruction set.

CONTENT RULES:
- SELECT bullets that already exist. Do not invent companies, titles, tools, or metrics.
- EDUCATION must be copied exactly from the MASTER BULLET BANK. Never invent degrees, schools, or locations.
- Every number must appear in the master bank or EVIDENCE CHUNKS.
- Lead with projects that match the job. Keep 4-6 bullets per project. Drop the rest.
- Reorder SKILLS so relevant technologies appear first. No stuffing.
- Target TWO PAGES. Use the 2-page template as length/layout only.
- Fill CONTACT from the CONTACT block. Never leave placeholders like [Email Address].
- CONTACT Title should be a realistic professional title (can match the target role if it fits experience). Do not write "Tailored for …".
- SUMMARY: 3-5 sentences in first person omitted (third-person implied resume style). State years, domain, and a few concrete outcomes. Do not open with the job title as a slogan.

Final Output (STRICT):
Return ONLY plain text. No Markdown. No preamble.
Use ONLY these section headers (ALL CAPS): NAME, CONTACT, SUMMARY, PROFESSIONAL EXPERIENCE, EDUCATION, SKILLS
For bullets use: - (hyphen + space)
CONTACT lines: Name, Title, Email, Phone, Location, LinkedIn, GitHub when available.`;

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
    `Focus: pick and lightly edit existing bullets that match this posting. Do not invent a new career story.`,
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
