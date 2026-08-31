export const RESUME_BANK_PREFIX = 'ATS Bank:';

export interface RolePlaybookShape {
  id: string;
  title: string;
  leadWith: readonly string[];
  emphasize: readonly string[];
  highlight: readonly string[];
  deemphasize?: string;
}

export function resumeBankName(playbook: { title: string }): string {
  return `${RESUME_BANK_PREFIX} ${playbook.title}`;
}

const CROSS_SECTIONS_BY_PLAYBOOK: Record<string, string[]> = {
  integration_architect: ['Security & Compliance', 'Operational Excellence'],
  genai_developer: ['AI Development Methodology'],
  forward_deployment: ['Forward Deployment Skills Demonstrated'],
  cloud_architect: ['Operational Excellence'],
  ai_ml_engineer: ['AI Development Methodology'],
  engineering_manager: ['Leadership & Mentoring', 'Security & Compliance', 'Operational Excellence'],
};

function extractHeader(master: string): string {
  const idx = master.indexOf('================================================================================');
  return idx > 0 ? master.slice(0, idx).trim() : master.slice(0, 600).trim();
}

function extractSectionByTitle(master: string, title: string): string | null {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`={10,}\\s*${escaped}\\s*={10,}`, 'i');
  const match = pattern.exec(master);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = master.slice(start);
  const nextMajor = rest.search(/\n={10,}\s*[A-Z0-9]/);
  const body = nextMajor >= 0 ? rest.slice(0, nextMajor) : rest;
  return `${title}\n${body.trim()}`;
}

function extractProjectBlock(master: string, projectNeedle: string): string | null {
  const lines = master.split('\n');
  const needleLower = projectNeedle.toLowerCase();
  const shortNeedle = needleLower.split(/[-–]/)[0].trim();

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('--- Project:') && !line.startsWith('--- AI Development')) continue;
    const lineLower = line.toLowerCase();
    if (lineLower.includes(needleLower) || (shortNeedle.length >= 4 && lineLower.includes(shortNeedle))) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('--- ') || lines[i].match(/^={10,}/)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

function extractCrossSection(master: string, name: string): string | null {
  const lines = master.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`--- ${name}`)) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('--- ') || lines[i].match(/^={10,}/)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

function filterCompetencies(section: string, emphasize: readonly string[]): string {
  const keywords = emphasize.map((e) => e.toLowerCase());
  const categoryHints = [
    'integration', 'cloud', 'genai', 'forward', 'ai/ml', 'leadership',
    'devops', 'security', 'database',
  ];
  const lines = section.split('\n');
  const out: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const isCategory = line.endsWith(':') && !line.startsWith('-') && line.length < 80;
    if (isCategory) {
      const lower = line.toLowerCase();
      inBlock = keywords.some((k) => lower.includes(k))
        || categoryHints.some((h) => lower.includes(h));
      if (inBlock) out.push(line);
    } else if (inBlock) {
      out.push(line);
      if (line.trim() === '' && out.filter((l) => l.startsWith('-')).length > 4) {
        inBlock = false;
      }
    }
  }

  return out.length > 4 ? out.join('\n') : section.slice(0, 2800);
}

function filterSkillsSection(section: string, emphasize: readonly string[]): string {
  const keywords = emphasize.map((e) => e.toLowerCase());
  const lines = section.split('\n');
  const out: string[] = [];
  let keepBlock = false;

  for (const line of lines) {
    const isCategory = line.endsWith(':') && !line.startsWith('-');
    if (isCategory) {
      const lower = line.toLowerCase();
      keepBlock = keywords.some((k) => lower.includes(k))
        || lower.includes('snaplogic')
        || lower.includes('gcp')
        || lower.includes('google')
        || lower.includes('kubernetes')
        || lower.includes('typescript')
        || lower.includes('ai');
      if (keepBlock) out.push(line);
    } else if (keepBlock) {
      out.push(line);
    }
  }

  return out.length > 6 ? out.join('\n') : section.slice(0, 4000);
}

function panwExperienceIntro(master: string): string | null {
  const exp = extractSectionByTitle(master, 'PROFESSIONAL EXPERIENCE');
  if (!exp) return null;
  const lines = exp.split('\n');
  const intro = lines.slice(0, 9).join('\n');
  return `PROFESSIONAL EXPERIENCE\n${intro}`;
}

/**
 * Build a role-focused bullet bank from the full master resume using playbook project mapping.
 */
export function buildFocusedMasterResume(
  fullMaster: string,
  playbook: RolePlaybookShape,
): string {
  const parts: string[] = [];
  parts.push(extractHeader(fullMaster));
  parts.push(`ROLE FOCUS: ${playbook.title}`);

  const summary = extractSectionByTitle(fullMaster, 'PROFESSIONAL SUMMARY');
  if (summary) parts.push(summary.slice(0, 1400));

  const competencies = extractSectionByTitle(fullMaster, 'CORE COMPETENCIES');
  if (competencies) parts.push(filterCompetencies(competencies, playbook.emphasize));

  const panwIntro = panwExperienceIntro(fullMaster);
  if (panwIntro) parts.push(panwIntro);

  for (const project of playbook.leadWith) {
    const block = extractProjectBlock(fullMaster, project);
    if (block) parts.push(block);
  }

  if (playbook.id === 'genai_developer' || playbook.id === 'ai_ml_engineer') {
    const genai = extractSectionByTitle(fullMaster, 'GENAI-AUGMENTED DEVELOPMENT METHODOLOGY & PROJECTS');
    if (genai) parts.push(genai.slice(0, 12000));
  }

  if (playbook.id === 'forward_deployment') {
    const fde = extractSectionByTitle(fullMaster, 'FORWARD DEPLOYMENT ENGINEERING');
    if (fde) parts.push(fde.slice(0, 6000));
  }

  for (const sectionName of CROSS_SECTIONS_BY_PLAYBOOK[playbook.id] || []) {
    const block = extractCrossSection(fullMaster, sectionName);
    if (block) parts.push(block);
  }

  for (const highlight of playbook.highlight) {
    if (highlight.length < 4) continue;
    const block = extractProjectBlock(fullMaster, highlight);
    if (block && !parts.some((p) => p.includes(block.slice(0, 50)))) parts.push(block);
  }

  const earlier = extractSectionByTitle(fullMaster, 'EARLIER EXPERIENCE');
  if (earlier) parts.push(earlier.slice(0, 4000));

  const skills = extractSectionByTitle(fullMaster, 'TECHNICAL SKILLS');
  if (skills) parts.push(filterSkillsSection(skills, playbook.emphasize));

  const education = extractSectionByTitle(fullMaster, 'EDUCATION');
  if (education) parts.push(education);

  const certs = extractSectionByTitle(fullMaster, 'CERTIFICATIONS');
  if (certs) parts.push(certs.slice(0, 2000));

  return parts.filter(Boolean).join('\n\n').trim();
}

export function selectMasterResumeForJob(
  fullMaster: string,
  playbook: RolePlaybookShape,
  resumeRows: { name: string; content: string | null }[],
): { content: string; source: 'role-bank' | 'generated' } {
  const bankName = resumeBankName(playbook);
  const bankRow = resumeRows.find((r) => r.name === bankName);
  if (bankRow?.content && bankRow.content.length > 500) {
    return { content: bankRow.content, source: 'role-bank' };
  }
  return { content: buildFocusedMasterResume(fullMaster, playbook), source: 'generated' };
}
