/** Keep ATS prompts bounded — full resumes can be 50k+ chars. */
export function trimForAts(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[${label} truncated — use only the text above]`;
}

export const ATS_SYSTEM_PROMPT = `You tailor an existing resume for a specific job. The result must sound like the candidate wrote it themselves after a careful edit — not like a language model.

VOICE (must read as human):
- Preserve the candidate's original phrasing, word choices, and tone. Prefer light edits: cut fluff, drop a clause, or change order. Do not rewrite every sentence into a generic template voice.
- Vary sentence length and structure. Mix short facts with one longer technical sentence. Do not start several bullets the same way.
- Never use these phrases: leveraged, utilized, spearheaded, orchestrated, synergized, cutting-edge, best-in-class, innovative solutions, cross-functional stakeholders, drove impactful results, results-driven, proven track record, passionate, demonstrated ability, highly skilled, seamless, robust ecosystem, furthermore, additionally, in order to, played a key role.
- Do not add qualifiers like successfully, effectively, or proactively unless they already appear in the source resume.
- Do not use em dashes or en dashes as separators.
- Do not keyword-stuff. Mention JD tools only where they already appear in the source resume.
- Mix bullet formats: achievement-first, context-first, and metric-first. Do not fill a template.

CONTENT CONTRACT:
- The RESUME block is the only factual source. Do not invent companies, titles, tools, skills, metrics, dates, certifications, education, or contact details.
- Keep metrics and numbers exactly as they appear in the source. Do not round, inflate, or embellish.
- Reorder and emphasize experience that matches the job. Drop or shorten less relevant projects.
- Target TWO PAGES.
- Fill NAME and CONTACT from the supplied contact block. Keep contact labels.
- SUMMARY: first-person professional tone (I / my), 2-3 sentences, no buzzword stacking, no opening slogan of the target title.
- SKILLS: list actual technologies and tools from the source resume. Do not pad with generic soft skills unless they appear in the source.
- Prefer action verbs the candidate already uses; only substitute when needed for JD keyword alignment.
- Never write that the resume was tailored, optimized, generated, or customized.

Final Output (STRICT):
Return ONLY plain text. No Markdown. No preamble.
Use ONLY these section headers (ALL CAPS), in this exact order: NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION
For bullets use: - (hyphen + space)
Each section header may appear exactly once. SKILLS and EDUCATION must never be empty. Include CERTIFICATION when the source lists certifications; omit the section when none exist.
Do not use === separators, PROFESSIONAL SUMMARY, EXECUTIVE SUMMARY, TECHNICAL SKILLS, or CORE COMPETENCIES as headers.

OUTPUT SKELETON:
NAME
<full name from contact>

CONTACT
<email, phone, location, linkedin, github from contact>

SUMMARY
<2-3 sentences in the candidate's voice, grounded in the source resume>

SKILLS
<compact skill lines from the source resume, ordered for the JD>

PROFESSIONAL EXPERIENCE
<company/project headers from the source resume>
<source bullets with light edits — keep metrics and employers unchanged>

CERTIFICATION
<certifications from the source, or omit this section if none exist>

EDUCATION
<education from the source resume>`;

export const HUMANIZE_RETRY_PROMPT = `The previous draft sounded AI-generated. Rewrite it more naturally in the candidate's original voice. Keep the 7-section format. Do not use banned cliche verbs. Vary bullet openings. Keep every fact and metric from the source resume.`;

export function buildResumeUserPrompt(input: {
  jobTitle?: string;
  company?: string;
  jobDescription: string;
  sourceResume: string;
  contactBlock: string;
  googleHeader?: string;
}): string {
  const jobDescription = trimForAts(input.jobDescription, 8000, 'Job description');
  const sourceResume = trimForAts(input.sourceResume, 40000, 'Source resume');

  return [
    `TARGET ROLE: ${input.jobTitle || '(unknown)'} at ${input.company || '(unknown)'}`,
    `Tailor the source resume for this posting. Keep the candidate's voice. Do not invent a new career story.`,
    `JOB DESCRIPTION:\n${jobDescription}`,
    input.contactBlock ? `CONTACT (copy these labeled values into NAME and CONTACT):\n${input.contactBlock}` : '',
    input.googleHeader ? `GOOGLE DOC HEADER OVERRIDE:\n${input.googleHeader}` : '',
    `RESUME:\n${sourceResume}`,
  ].filter(Boolean).join('\n\n');
}

export function buildGroqResumeUserPrompt(input: {
  jobTitle?: string;
  company?: string;
  jobDescription: string;
  sourceResume: string;
  contactBlock?: string;
}): string {
  const jobDescription = trimForAts(input.jobDescription, 2500, 'Job description');
  const sourceResume = trimForAts(input.sourceResume, 12000, 'Source resume');

  return [
    `TARGET ROLE: ${input.jobTitle || '(unknown)'} at ${input.company || '(unknown)'}`,
    `Keep the 7-header contract: NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION.`,
    `JOB DESCRIPTION (excerpt):\n${jobDescription}`,
    input.contactBlock ? `CONTACT (copy labeled values):\n${input.contactBlock}` : '',
    `RESUME:\n${sourceResume}`,
  ].filter(Boolean).join('\n\n');
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

export const ROLE_MATCH_SYSTEM_PROMPT = `You match a job title to a named resume variant. Return only the resume name, or master.`;

export function buildRoleMatchUserPrompt(input: {
  jobTitle: string;
  jobDescription?: string;
  resumeNames: string[];
}): string {
  return [
    `Resumes: ${JSON.stringify(input.resumeNames)}`,
    `Job title: ${input.jobTitle || '(unknown)'}`,
    input.jobDescription ? `Job excerpt: ${input.jobDescription.slice(0, 400)}` : '',
    `Return only the matching resume name, or master if none fit.`,
  ].filter(Boolean).join('\n');
}

/** Map a model reply to a known role-resume name, or "master". */
export function pickMatchedResumeName(raw: string, names: string[]): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^resume:\s*/i, '')
    .split('\n')[0]
    .trim();
  if (!cleaned || /^master$/i.test(cleaned)) return 'master';
  const lower = cleaned.toLowerCase();
  const exact = names.find((name) => name.toLowerCase() === lower);
  if (exact) return exact;
  const contained = names.find((name) => lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower));
  return contained || 'master';
}
