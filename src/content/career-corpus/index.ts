export const MASTER_RESUME_NAME = 'Master ATS (bullet bank)';
export const TWO_PAGE_RESUME_NAME = '2-page template';

/** Canonical education block used when a source resume has none. */
export const DEFAULT_EDUCATION = `B.Tech in Information Technology
SASTRA University | Thanjavur`;

/** Replace placeholder or known-wrong education text in resume content. */
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
  contact: {
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    startDate?: string;
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
  ];
  for (const [label, value] of headerLines) {
    if (!value) continue;
    out = out.replace(new RegExp(`^${label}:.*$`, 'm'), `${label}: ${value}`);
  }
  if (contact.fullName) {
    out = out.replace(/^ARUN KUMAR/m, contact.fullName.toUpperCase());
  }
  if (contact.title) {
    out = out.replace(
      /Integration Architect \| GenAI Developer \| Forward Deployment Engineer/,
      contact.title,
    );
    out = out.replace(
      /Integration Architect \| Full-Stack Developer \| Cloud & AI Solutions Engineer/,
      contact.title,
    );
  }
  return replaceEducationPlaceholders(out);
}
