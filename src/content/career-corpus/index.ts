import masterResume from './master-resume.md?raw';
import twoPageTemplate from './two-page-template.md?raw';
import experienceBullets from './experience-bullets.md?raw';
import atsKeywords from './ats-keywords.md?raw';
import rolePlaybooks from './role-playbooks.json';
import evidenceChunks from './evidence-chunks.json';

export const MASTER_RESUME_NAME = 'Master ATS (bullet bank)';
export const TWO_PAGE_RESUME_NAME = '2-page template';

export interface RolePlaybook {
  id: string;
  title: string;
  matchKeywords: string[];
  leadWith: string[];
  emphasize: string[];
  highlight: string[];
  deemphasize: string;
}

export interface EvidenceChunk {
  id: string;
  tags: string[];
  text: string;
}

export const CAREER_CORPUS = {
  masterResume,
  twoPageTemplate,
  experienceBullets,
  atsKeywords,
  rolePlaybooks: rolePlaybooks as unknown as RolePlaybook[],
  evidenceChunks: evidenceChunks as EvidenceChunk[],
};

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
  return out;
}
