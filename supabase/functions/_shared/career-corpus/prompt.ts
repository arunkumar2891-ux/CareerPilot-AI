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
- Each PROFESSIONAL EXPERIENCE bullet must be a light edit of exactly one source bullet. Do not merge two source bullets into a new sentence.
- Do not add tools, products, companies, or metrics that are not on that source line. Do not invent product usage stats (tokens processed, pipeline runs, latency) even if they seem true of the candidate's work.
- Prefer dropping or shortening a bullet over synthesizing a new one.
- SUMMARY may rephrase source sentences but must not introduce a new accomplishment or any number that is not in the source.
- Do not repeat the same achievement in SUMMARY and PROFESSIONAL EXPERIENCE.
- Reorder and emphasize experience that matches the job. Drop or shorten less relevant projects.
- Target TWO PAGES. Keep experience at or below the source bullet count. Do not invent extra bullets.
- Company, role, date, and project title lines are headers: do not start them with "- ". Only achievement lines use "- ".
- Fill NAME and CONTACT from the supplied contact block. Keep contact labels. If the source resume or contact block has a personal website, portfolio, or homepage URL, keep it as a "Website:" line in CONTACT. Never invent one.
- SUMMARY: first-person professional tone (I / my), 2-3 sentences, no buzzword stacking, no opening slogan of the target title.
- SKILLS: group skills into categories. Write each category as a heading line ending in ":" (for example "Cloud:"), then one or more "- " item lines of comma-separated tools beneath it. List actual technologies and tools from the source resume. Do not pad with generic soft skills unless they appear in the source. Use at most 6 categories.
- PROFESSIONAL EXPERIENCE: write each entry as "COMPANY | Role" on one line, then "Dates | Location" on the next line, then the achievement bullets. Keep employers, titles, and dates exactly as the source has them.
- SELECTED PROJECTS: keep the projects the source resume lists. Write each project as a plain title line ("Project Name | Role"), then "- Type: Official" or "- Type: Personal", then "- Technologies: <comma-separated stack>", then the achievement bullets. Do not wrap project titles in asterisks or any other markup.
- PROJECT TYPE: every project must carry a "- Type:" line. Use "Official" for work done for an employer or client, and "Personal" for self-directed or side projects. Decide from the source resume only: the section heading or wording the project appears under, an employer or client named in the project, or an explicit type label. If the source does not make the type clear for a given project, omit that project's "- Type:" line rather than guessing.
- CERTIFICATION and EDUCATION: one "- " bullet per entry.
- Prefer action verbs the candidate already uses; only substitute when needed for JD keyword alignment.
- Never write that the resume was tailored, optimized, generated, or customized.

Final Output (STRICT):
Return ONLY plain text. No Markdown. No preamble.
Use ONLY these section headers (ALL CAPS), in this exact order: NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, SELECTED PROJECTS, CERTIFICATION, EDUCATION
For bullets use: - (hyphen + space)
Each section header may appear exactly once. SKILLS and EDUCATION must never be empty. Include SELECTED PROJECTS when the source lists projects and CERTIFICATION when the source lists certifications; omit either section when none exist.
Do not use === separators, PROFESSIONAL SUMMARY, EXECUTIVE SUMMARY, TECHNICAL SKILLS, CORE COMPETENCIES, PERSONAL PROJECTS, or PROJECTS as headers.

OUTPUT SKELETON:
NAME
<full name from contact>

CONTACT
Email: <email>
Phone: <phone>
Location: <location>
Website: <personal site url, only if the source has one>
LinkedIn: <linkedin url>
GitHub: <github url>

SUMMARY
<2-3 sentences in the candidate's voice, grounded in the source resume>

SKILLS
<Category>:
- <comma-separated tools from the source resume>
- <second item line for this category, when the source has more>

<Next Category>:
- <comma-separated tools from the source resume>

PROFESSIONAL EXPERIENCE
<COMPANY> | <Role>
<Start> - <End> | <Location>
- <source bullet with light edits — keep metrics and employers unchanged>

SELECTED PROJECTS
<Project Name> | <Role>
- Type: Official
- Technologies: <comma-separated stack from the source resume>
- <source project bullet with light edits>

<Next Project Name> | <Role>
- Type: Personal
- Technologies: <comma-separated stack from the source resume>
- <source project bullet with light edits>

CERTIFICATION
- <certification from the source, or omit this section if none exist>

EDUCATION
- <degree, institution, year, location from the source resume>`;

export const HUMANIZE_RETRY_PROMPT = `The previous draft sounded AI-generated. Rewrite it more naturally in the candidate's original voice. Keep the 8-section format. Do not use banned cliche verbs. Vary bullet openings. Keep every fact and metric from the source resume.`;

export function groundingRetryPrompt(reason: string): string {
  return `The previous draft failed validation (${reason}). Delete the rejected line, or replace it with a near-verbatim copy of one source resume bullet. Do not add facts, tools, or metrics. Do not merge two source bullets. Do not repeat the same achievement in SUMMARY and PROFESSIONAL EXPERIENCE. Keep the 8-section format.`;
}

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
    `Keep the 8-header contract: NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, SELECTED PROJECTS, CERTIFICATION, EDUCATION.`,
    `SKILLS uses "Category:" heading lines with "- " item lines. PROFESSIONAL EXPERIENCE uses "COMPANY | Role" then "Dates | Location" then "- " bullets. SELECTED PROJECTS uses a plain title line, then "- Type: Official" or "- Type: Personal" (only when the source makes the type clear), then "- Technologies: ...", then "- " bullets.`,
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
