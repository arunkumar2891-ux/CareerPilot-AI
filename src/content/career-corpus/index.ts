export const MASTER_RESUME_NAME = 'Master ATS (bullet bank)';
export const TWO_PAGE_RESUME_NAME = '2-page template';

/**
 * The template block a starter resume uses in place of real education.
 * Matched as a unit so a partially-filled block is left alone.
 */
const EDUCATION_PLACEHOLDER_RE =
  /\[Degree Name\][^\n]*\n\[University Name\][^\n]*(?:\n\[Graduation Year\][^\n]*)?/g;

/**
 * Fill the education template block from the user's own configured education.
 *
 * This used to substitute a `DEFAULT_EDUCATION` constant holding one specific
 * person's degree (`B.Tech / SASTRA University`), and separately rewrote any
 * resume containing `Bachelor of Engineering in Computer Science / Anna
 * University` to that value — silently destroying a real credential rather
 * than filling a placeholder. Both are gone; there is no global default degree.
 *
 * With nothing configured the placeholders are left visible, which prompts the
 * user to fill them in. An invented degree is something they would never think
 * to check.
 *
 * Mirrors `replaceEducationPlaceholders` in
 * `supabase/functions/_shared/career-corpus/prompt.ts`. The two cannot share a
 * module (one is bundled by Vite, the other runs in Deno), so changes must land
 * in both.
 */
export function replaceEducationPlaceholders(text: string, education?: string): string {
  const block = education?.trim();
  if (!block) return text;
  return text.replace(EDUCATION_PLACEHOLDER_RE, block);
}

/** Section headers that must never be mistaken for the candidate's name. */
const SECTION_HEADER_LINES = new Set([
  'NAME',
  'CONTACT',
  'SUMMARY',
  'SKILLS',
  'PROFESSIONAL EXPERIENCE',
  'EXPERIENCE',
  'SELECTED PROJECTS',
  'PERSONAL PROJECTS',
  'PROJECTS',
  'CERTIFICATION',
  'CERTIFICATIONS',
  'EDUCATION',
]);

const NAME_LINE_MAX_LENGTH = 60;
const TAGLINE_MAX_LENGTH = 120;

function firstContentLineIndex(lines: string[], from = 0): number {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i].trim()) return i;
  }
  return -1;
}

function looksLikeNameLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > NAME_LINE_MAX_LENGTH) return false;
  if (SECTION_HEADER_LINES.has(trimmed.toUpperCase())) return false;
  if (trimmed.includes(':') || /\d/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 6;
}

/**
 * A role tagline such as `Integration Architect | GenAI Developer`. Requiring a
 * `|` keeps this conservative: it is the near-universal resume convention, and
 * it cannot match a `Label: value` contact line or a date range.
 */
function looksLikeTaglineLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > TAGLINE_MAX_LENGTH) return false;
  if (SECTION_HEADER_LINES.has(trimmed.toUpperCase())) return false;
  if (trimmed.includes(':') || /\d/.test(trimmed)) return false;
  return trimmed.includes('|');
}

/**
 * Overlay the user's name and role tagline onto the resume header.
 *
 * Both were previously matched by literal string: the name via
 * `/^ARUN KUMAR/m` and the title against two exact taglines. That made the
 * Settings → Full Name and Title fields a silent no-op for every other user.
 * Position plus shape is used instead, so this works for any candidate.
 *
 * Mirrors `overlayResumeHeader` in the backend `prompt.ts`.
 */
export function overlayResumeHeader(text: string, fullName?: string, title?: string): string {
  if (!fullName && !title) return text;
  const lines = text.split('\n');

  let cursor = firstContentLineIndex(lines);
  if (cursor >= 0 && lines[cursor].trim().toUpperCase() === 'NAME') {
    cursor = firstContentLineIndex(lines, cursor + 1);
  }
  if (cursor < 0 || !looksLikeNameLine(lines[cursor])) return text;

  if (fullName) lines[cursor] = fullName.toUpperCase();

  if (title) {
    const next = firstContentLineIndex(lines, cursor + 1);
    if (next >= 0 && looksLikeTaglineLine(lines[next])) lines[next] = title;
  }

  return lines.join('\n');
}

export function applyContactOverlay(
  text: string,
  contact: {
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    website?: string;
    startDate?: string;
    education?: string;
  },
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
    ['Website', contact.website],
  ];
  for (const [label, value] of headerLines) {
    if (!value) continue;
    out = out.replace(new RegExp(`^${label}:.*$`, 'm'), `${label}: ${value}`);
  }
  out = overlayResumeHeader(out, contact.fullName, contact.title);
  return replaceEducationPlaceholders(out, contact.education);
}
