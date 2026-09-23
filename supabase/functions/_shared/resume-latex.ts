export interface ResumeLatexMeta {
  targetRole?: string;
  targetCompany?: string;
  template?: PdfTemplate;
}

export type PdfTemplate = 'classic' | 'modern_single' | 'modern_two_column';

const SECTION_HEADERS = [
  'NAME',
  'CONTACT',
  'SUMMARY',
  'SKILLS',
  'PROFESSIONAL EXPERIENCE',
  'SELECTED PROJECTS',
  'PERSONAL PROJECTS',
  'CERTIFICATION',
  'CERTIFICATIONS',
  'EDUCATION',
  'TECHNICAL SKILLS',
  'PROFESSIONAL SUMMARY',
  'EXECUTIVE SUMMARY',
  'CORE COMPETENCIES',
  'WORK EXPERIENCE',
];

const MARKDOWN_SECTION_ALIASES: Record<string, string> = {
  name: 'NAME',
  contact: 'CONTACT',
  summary: 'SUMMARY',
  'professional summary': 'SUMMARY',
  'executive summary': 'SUMMARY',
  skills: 'SKILLS',
  'technical skills': 'SKILLS',
  'core competencies': 'SKILLS',
  experience: 'PROFESSIONAL EXPERIENCE',
  'work experience': 'PROFESSIONAL EXPERIENCE',
  'professional experience': 'PROFESSIONAL EXPERIENCE',
  'selected projects': 'SELECTED PROJECTS',
  'personal projects': 'SELECTED PROJECTS',
  projects: 'SELECTED PROJECTS',
  certification: 'CERTIFICATION',
  certifications: 'CERTIFICATION',
  education: 'EDUCATION',
};

function esc(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function escUrl(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '%5C')
    .replace(/%/g, '%25')
    .replace(/#/g, '%23');
}

function stripUrlScheme(raw: string): string {
  return String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

/** moderncv \\social[linkedin] prepends linkedin.com/in/ — pass the handle only. */
export function extractLinkedInHandle(raw: string): string {
  const cleaned = stripUrlScheme(raw).replace(/\/+$/, '');
  const inMatch = cleaned.match(/(?:^|\/)linkedin\.com\/in\/([^/?#]+)/i);
  if (inMatch?.[1]) return inMatch[1];
  const pubMatch = cleaned.match(/(?:^|\/)linkedin\.com\/pub\/([^/?#]+)/i);
  if (pubMatch?.[1]) return pubMatch[1];
  if (/linkedin\.com\//i.test(cleaned)) {
    const parts = cleaned.split('/').filter(Boolean);
    return parts[parts.length - 1] || cleaned;
  }
  return cleaned.replace(/^@/, '').split('/')[0].trim();
}

/** moderncv \\social[github] prepends github.com/ — pass the handle only. */
export function extractGitHubHandle(raw: string): string {
  const cleaned = stripUrlScheme(raw).replace(/\/+$/, '');
  const match = cleaned.match(/(?:^|\/)github\.com\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  return cleaned.replace(/^@/, '').replace(/^github\.com\//i, '').split('/')[0].trim();
}

export function buildLinkedInUrl(raw: string): string {
  const handle = extractLinkedInHandle(raw);
  return `https://www.linkedin.com/in/${handle}`;
}

export function buildGitHubUrl(raw: string): string {
  const handle = extractGitHubHandle(raw);
  return `https://github.com/${handle}`;
}

function sectionBoundaryPattern(): string {
  return SECTION_HEADERS
    .map((header) => header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

/** Convert markdown headings and inline decoration to the ATS-style text the PDF parser expects. */
export function normalizeResumeTextForPdf(raw: string): string {
  const stripped = String(raw || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

  const lines = stripped.split('\n').map((line) => {
    const trimmed = line.trim();
    const markdownHeader = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (!markdownHeader) return line;

    const label = markdownHeader[1].trim();
    const key = label.toLowerCase();
    const known = MARKDOWN_SECTION_ALIASES[key];
    if (known) return known;
    // Project titles often use ##/### headings — keep original casing, not ALL CAPS.
    return label;
  });

  return lines.join('\n').trim();
}

function extractSection(raw: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const boundary = sectionBoundaryPattern();
  const patterns = [
    new RegExp(`(?:^|\\n)${escaped}\\s*\\n([\\s\\S]*?)(?=\\n(?:${boundary})\\s*\\n|$)`, 'i'),
    new RegExp(`(?:^|\\n)${escaped}\\s*:?\\s*\\n([\\s\\S]*?)(?=\\n(?:${boundary})\\s*:?\\s*\\n|$)`, 'i'),
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return '';
}

function parseContactFields(contactRaw: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of contactRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon > 0) {
      const key = trimmed.slice(0, colon).trim().toLowerCase();
      const value = trimmed.slice(colon + 1).trim();
      if (value) fields[key] = value;
    }
  }
  return fields;
}

function splitName(fullName: string): { first: string; last: string } {
  const cleaned = fullName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return { first: 'Your', last: 'Name' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { first: esc(parts[0]), last: '' };
  return {
    first: esc(parts.slice(0, -1).join(' ')),
    last: esc(parts[parts.length - 1]),
  };
}

function formatBulletList(items: string[]): string {
  if (!items.length) return '';
  const body = items.map((item) => `\\item ${esc(item)}`).join('\n');
  return `\\begin{itemize}[leftmargin=*, nosep]\n${body}\n\\end{itemize}`;
}

interface PersonalProjectBlock {
  title: string;
  meta: string[];
  bullets: string[];
}

interface CategoryBlock {
  heading: string;
  items: string[];
}

function stripProjectLineDecorators(line: string): string {
  return String(line || '')
    .trim()
    .replace(/^#{1,3}\s+/, '')
    .replace(/^[-•]\s+/, '')
    .trim();
}

function isBulletLine(line: string): boolean {
  const trimmed = String(line || '').trim();
  return /^[-•]\s/.test(trimmed) || /^[-•]\s/.test(stripProjectLineDecorators(trimmed));
}

function parseProjectTag(line: string): string | null {
  const projectTag = line.match(/^PROJECT:\s*(.+)$/i)
    || line.match(/^---\s*Project:\s*(.+?)---\s*$/i)
    || line.match(/^---\s*Project:\s*(.+)$/i);
  return projectTag?.[1]?.trim() || null;
}

function looksLikeProjectTitle(line: string): boolean {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.length < 8) return false;
  if (/^(Technologies|Role|Duration|Type):/i.test(trimmed)) return false;
  if (/^(Built|Implemented|Designed|Developed|Created|Led|Managed)\b/i.test(trimmed)) return false;
  return /\|/.test(trimmed) || /\s-\s/.test(trimmed) || /^[A-Z0-9][\w\s.&/-]{7,}$/.test(trimmed);
}

function isTechnologiesLine(line: string): boolean {
  return /^Technologies:/i.test(stripProjectLineDecorators(line));
}

/**
 * Project meta lines — rendered under the title rather than as achievement
 * bullets. `Type:` carries Official / Personal, which the prompt emits so the
 * reader can tell employer work from side projects.
 */
const PROJECT_META_RE = /^(Technologies|Duration|Type):/i;

/** Order meta lines Type → Technologies → rest, so the type reads first. */
function sortProjectMeta(meta: string[]): string[] {
  const rank = (line: string): number => {
    if (/^Type:/i.test(line)) return 0;
    if (/^Technologies:/i.test(line)) return 1;
    return 2;
  };
  return meta
    .map((line, index) => ({ line, index }))
    .sort((a, b) => rank(a.line) - rank(b.line) || a.index - b.index)
    .map((entry) => entry.line);
}

/**
 * Index of the first line in the run of meta lines sitting directly above
 * `techIdx`. Those lines belong to *that* project, not the one before it.
 *
 * The prompt emits `- Type: Official` between the title and `- Technologies:`,
 * so without this the type line would either be dropped (first project) or
 * absorbed as a bullet of the previous project.
 */
function metaRunStart(lines: string[], techIdx: number): number {
  let start = techIdx;
  for (let i = techIdx - 1; i >= 0; i--) {
    const candidate = stripProjectLineDecorators(lines[i]);
    if (!candidate) break;
    if (!PROJECT_META_RE.test(candidate)) break;
    start = i;
  }
  return start;
}

function normalizeProjectBlock(block: PersonalProjectBlock): PersonalProjectBlock {
  const meta = [...block.meta];
  const bullets: string[] = [];
  let title = block.title;

  for (const item of block.bullets) {
    if (PROJECT_META_RE.test(item)) {
      meta.push(item);
      continue;
    }
    const roleMatch = item.match(/^Role:\s*(.+)$/i);
    if (roleMatch) {
      if (!title && roleMatch[1]?.trim()) title = roleMatch[1].trim();
      else meta.push(item);
      continue;
    }
    bullets.push(item);
  }

  const hasTechnologies = meta.some((line) => /^Technologies:/i.test(line));
  if (!title && hasTechnologies && bullets.length > 0 && looksLikeProjectTitle(bullets[0])) {
    title = bullets[0];
    bullets.shift();
  }

  return { title, meta: sortProjectMeta(meta), bullets };
}

function splitBulletsByTitle(bullets: string[]): Array<{ title: string; bullets: string[] }> {
  const groups: Array<{ title: string; bullets: string[] }> = [];
  let current: { title: string; bullets: string[] } = { title: '', bullets: [] };

  const pushCurrent = () => {
    if (!current.title && !current.bullets.length) return;
    groups.push(current);
    current = { title: '', bullets: [] };
  };

  for (const bullet of bullets) {
    if (looksLikeProjectTitle(bullet)) {
      if (current.bullets.length > 0 || current.title) pushCurrent();
      if (!current.title) current.title = bullet;
      else pushCurrent(), current = { title: bullet, bullets: [] };
      continue;
    }
    current.bullets.push(bullet);
  }
  pushCurrent();
  return groups;
}

function findProjectTitleBefore(lines: string[], technologiesIndex: number): string {
  for (let j = technologiesIndex - 1; j >= 0; j--) {
    const raw = lines[j];
    const candidate = stripProjectLineDecorators(raw);
    if (!candidate) continue;
    if (isTechnologiesLine(raw)) break;

    const taggedTitle = parseProjectTag(candidate);
    if (taggedTitle) return taggedTitle;

    if (/^(Duration|Role|Type):/i.test(candidate)) continue;

    if (isBulletLine(raw)) {
      if (j === technologiesIndex - 1 && looksLikeProjectTitle(candidate)) return candidate;
      break;
    }

    return candidate;
  }
  return '';
}

function isConsecutiveTechnologiesRun(lines: string[], techIndices: number[]): boolean {
  if (techIndices.length <= 1) return false;
  const start = techIndices[0];
  const end = techIndices[techIndices.length - 1];
  for (let i = start; i <= end; i++) {
    const candidate = stripProjectLineDecorators(lines[i]);
    if (!/^(Technologies|Role|Duration|Type):/i.test(candidate)) return false;
  }
  return true;
}

function parseConsecutiveTechnologiesProjects(lines: string[], techIndices: number[]): PersonalProjectBlock[] {
  const leadingTitle = findProjectTitleBefore(lines, techIndices[0]);
  const technologies = techIndices.map((index) => stripProjectLineDecorators(lines[index]));
  const bulletStart = techIndices[techIndices.length - 1] + 1;
  const bullets: string[] = [];

  for (let i = bulletStart; i < lines.length; i++) {
    const raw = lines[i];
    const candidate = stripProjectLineDecorators(raw);
    if (!candidate) continue;
    if (isTechnologiesLine(raw)) break;
    bullets.push(candidate);
  }

  const groups = splitBulletsByTitle(bullets);
  while (groups.length < technologies.length) {
    groups.push({ title: '', bullets: [] });
  }

  return technologies.map((technology, index) => {
    const group = groups[index] || { title: '', bullets: [] };
    const title = index === 0 ? (leadingTitle || group.title) : group.title;
    const blockBullets = index === 0 && leadingTitle
      ? group.bullets
      : (group.title === title ? group.bullets : group.bullets);
    return normalizeProjectBlock({
      title,
      meta: [technology],
      bullets: blockBullets,
    });
  });
}

function parsePerTechnologiesProjects(lines: string[], techIndices: number[]): PersonalProjectBlock[] {
  const blocks: PersonalProjectBlock[] = [];

  for (let t = 0; t < techIndices.length; t++) {
    const techIdx = techIndices[t];
    const nextTechIdx = techIndices[t + 1] ?? lines.length;
    // Meta lines directly above the next Technologies line belong to the next
    // project, so this project's bullets must stop before them.
    const bulletEnd = techIndices[t + 1] === undefined
      ? lines.length
      : metaRunStart(lines, techIndices[t + 1]);
    const metaStart = metaRunStart(lines, techIdx);
    const title = findProjectTitleBefore(lines, techIdx);
    const meta: string[] = [];

    // Meta lines that precede `Technologies:` (the prompt puts `Type:` here).
    for (let i = metaStart; i < techIdx; i++) {
      meta.push(stripProjectLineDecorators(lines[i]));
    }

    let cursor = techIdx;
    while (cursor < nextTechIdx) {
      const candidate = stripProjectLineDecorators(lines[cursor]);
      if (PROJECT_META_RE.test(candidate) || /^Role:/i.test(candidate)) {
        meta.push(candidate);
        cursor++;
        continue;
      }
      break;
    }

    const bullets: string[] = [];
    while (cursor < bulletEnd) {
      const raw = lines[cursor];
      const candidate = stripProjectLineDecorators(raw);
      if (!candidate) {
        cursor++;
        continue;
      }
      if (isTechnologiesLine(raw)) break;
      if (!isBulletLine(raw) && looksLikeProjectTitle(candidate)) break;
      bullets.push(candidate);
      cursor++;
    }

    blocks.push(normalizeProjectBlock({ title, meta, bullets }));
  }

  return blocks;
}

function parsePersonalProjectBlocksSequential(lines: string[]): PersonalProjectBlock[] {
  const blocks: PersonalProjectBlock[] = [];
  let current: PersonalProjectBlock | null = null;

  const flush = () => {
    if (!current) return;
    const normalized = normalizeProjectBlock(current);
    if (normalized.title || normalized.meta.length || normalized.bullets.length) {
      blocks.push(normalized);
    }
    current = null;
  };

  const ensureProject = () => {
    if (!current) current = { title: '', meta: [], bullets: [] };
  };

  for (const rawLine of lines) {
    const candidate = stripProjectLineDecorators(rawLine);
    if (!candidate) continue;

    const taggedTitle = parseProjectTag(candidate);
    if (taggedTitle) {
      flush();
      current = { title: taggedTitle, meta: [], bullets: [] };
      continue;
    }

    if (/^Technologies:/i.test(candidate)) {
      ensureProject();
      current!.meta.push(candidate);
      continue;
    }

    if (/^Duration:/i.test(candidate) || /^Type:/i.test(candidate)) {
      ensureProject();
      current!.meta.push(candidate);
      continue;
    }

    const roleMatch = candidate.match(/^Role:\s*(.+)$/i);
    if (roleMatch) {
      ensureProject();
      if (!current!.title && roleMatch[1]?.trim()) {
        current!.title = roleMatch[1].trim();
        continue;
      }
      current!.meta.push(candidate);
      continue;
    }

    if (isBulletLine(rawLine)) {
      ensureProject();
      current!.bullets.push(candidate);
      continue;
    }

    flush();
    current = { title: candidate, meta: [], bullets: [] };
  }

  flush();
  return blocks;
}

/**
 * Section header for projects, plus the pre-rename name. Legacy master resumes
 * and cached tailored resumes still say `PERSONAL PROJECTS`, and plain-text
 * headers are not alias-mapped (only markdown headings are), so extraction has
 * to try both or those resumes lose the section entirely.
 */
const PROJECT_SECTION_HEADERS = ['SELECTED PROJECTS', 'PERSONAL PROJECTS'];

function findOrphanProjectTitleBeforeHeader(raw: string): string {
  const headerMatch = raw.match(/(?:^|\n)(?:SELECTED|PERSONAL) PROJECTS\s*\n/i);
  if (!headerMatch || headerMatch.index === undefined) return '';

  const before = raw.slice(0, headerMatch.index);
  const lines = before.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const rawLine = lines[i];
    const candidate = stripProjectLineDecorators(rawLine);
    if (!candidate) continue;
    if (SECTION_HEADERS.includes(candidate.toUpperCase())) break;
    if (/^(Technologies|Role|Duration):/i.test(candidate)) break;
    if (isBulletLine(rawLine) && !looksLikeProjectTitle(candidate)) break;
    if (looksLikeProjectTitle(candidate)) return candidate;
    break;
  }
  return '';
}

function extractPersonalProjectsSection(raw: string): string {
  const section = PROJECT_SECTION_HEADERS
    .map((header) => extractSection(raw, header))
    .find((found) => found.trim()) || '';
  if (!section) return '';

  const trimmed = section.trim();
  const startsWithTechnologies = /^(?:-\s*)?Technologies:/i.test(trimmed);
  if (!startsWithTechnologies) return section;

  const orphanTitle = findOrphanProjectTitleBeforeHeader(raw);
  return orphanTitle ? `${orphanTitle}\n${section}` : section;
}

function parsePersonalProjectBlocks(raw: string): PersonalProjectBlock[] {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const techIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTechnologiesLine(lines[i])) techIndices.push(i);
  }

  if (!techIndices.length) {
    return parsePersonalProjectBlocksSequential(lines);
  }

  if (isConsecutiveTechnologiesRun(lines, techIndices)) {
    return parseConsecutiveTechnologiesProjects(lines, techIndices);
  }

  return parsePerTechnologiesProjects(lines, techIndices);
}

function parseCategorizedLines(raw: string): CategoryBlock[] {
  const blocks: CategoryBlock[] = [];
  let heading = '';
  let items: string[] = [];

  const flush = () => {
    if (!heading && !items.length) return;
    blocks.push({ heading, items: [...items] });
    heading = '';
    items = [];
  };

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const bullet = trimmed.match(/^[-•]\s*(.+)$/);
    if (bullet) {
      items.push(bullet[1].trim());
      continue;
    }

    if (trimmed.endsWith(':') && !/^https?:\/\//i.test(trimmed)) {
      flush();
      heading = trimmed;
      continue;
    }

    items.push(trimmed);
  }

  flush();
  return blocks;
}

function renderProjectBlockParts(block: PersonalProjectBlock): string[] {
  const parts: string[] = [];
  if (block.title) {
    // moderncv drops grouped {\\bfseries ...\\par} inside \\cvitem; \\textbf + line break renders reliably.
    parts.push(`\\textbf{${esc(block.title)}}\\\\[3pt]`);
  }
  for (const meta of block.meta) {
    parts.push(`${esc(meta)}\\\\[2pt]`);
  }
  if (block.bullets.length) parts.push(formatBulletList(block.bullets));
  return parts;
}

function formatProjectsLatex(raw: string): string {
  const blocks = parsePersonalProjectBlocks(raw);
  if (!blocks.length) {
    const fallback = raw.trim();
    return fallback ? `\\cvitem{}{${esc(fallback.slice(0, 12000))}}` : '';
  }

  return blocks.map((block) => {
    const parts = renderProjectBlockParts(block);
    return `\\cvitem{}{\\begin{minipage}[t]{\\linewidth}\n${parts.join('\n')}\n\\end{minipage}}`;
  }).join('\n\n');
}

function formatTwoColumnProjects(raw: string): string {
  const blocks = parsePersonalProjectBlocks(raw);
  if (!blocks.length) {
    const fallback = raw.trim();
    return fallback
      ? `\\begin{itemize}[leftmargin=*, nosep]\n\\item ${esc(fallback.slice(0, 12000))}\n\\end{itemize}`
      : '';
  }

  return blocks.map((block) => renderProjectBlockParts(block).join('\n')).join('\n\n\\vspace{6pt}\n\n');
}

function formatExperienceLatex(experienceRaw: string): string {
  if (!experienceRaw.trim()) return '';
  const lines = experienceRaw.split('\n');
  const blocks: string[] = [];
  let currentLabel = '';
  let bullets: string[] = [];
  let preamble: string[] = [];

  const flush = () => {
    if (bullets.length > 0) {
      const label = esc(currentLabel || 'Professional Experience');
      blocks.push(`\\cvitem{${label}}{${formatBulletList(bullets)}}`);
      bullets = [];
    } else if (preamble.length > 0) {
      blocks.push(`\\cvitem{}{${esc(preamble.join(' '))}}`);
      preamble = [];
    }
    currentLabel = '';
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (t.startsWith('- ') || t.startsWith('• ')) {
      bullets.push(t.replace(/^[-•]\s*/, '').trim());
      continue;
    }

    const metaMatch = t.match(/^(Technologies|Role|Duration|Type):\s*(.*)$/i);
    if (metaMatch) {
      bullets.push(`${metaMatch[1]}: ${metaMatch[2].trim()}`);
      continue;
    }

    const projectMatch = t.match(/^PROJECT:\s*(.*)$/i)
      || t.match(/^---\s*Project:\s*(.+?)---\s*$/i)
      || t.match(/^---\s*Project:\s*(.+)$/i);
    if (projectMatch) {
      flush();
      currentLabel = (projectMatch[1]?.trim() || t).slice(0, 72);
      continue;
    }

    if (/^(PALO ALTO|INFOSYS|TATA|TCS|PROJECT:|CRITICAL|SECURITY|LEADERSHIP)/i.test(t) && t.length < 100) {
      flush();
      currentLabel = t.slice(0, 72);
      continue;
    }

    if (bullets.length === 0 && preamble.length < 2 && t.length < 140) {
      preamble.push(t);
    } else {
      if (preamble.length) {
        bullets.push(preamble.join(' '));
        preamble = [];
      }
      if (t.length > 20) bullets.push(t);
    }
  }
  flush();

  if (blocks.length === 0) {
    return `\\cvitem{Professional Experience}{${esc(experienceRaw.slice(0, 12000))}}`;
  }
  return blocks.join('\n\n');
}

function formatCategorizedLatex(raw: string): string {
  const blocks = parseCategorizedLines(raw);
  if (!blocks.length) {
    const fallback = raw.trim();
    return fallback ? `\\cvitem{}{${esc(fallback.slice(0, 12000))}}` : '';
  }

  return blocks.map((block) => {
    const parts: string[] = [];
    if (block.heading) parts.push(`\\textbf{${esc(block.heading)}}`);
    if (block.items.length) parts.push(formatBulletList(block.items));
    return `\\cvitem{}{${parts.join('\n')}}`;
  }).join('\n\n');
}

function formatCategorizedTwoColumn(raw: string, sectionTitle?: string): string {
  const blocks = parseCategorizedLines(raw);
  if (!blocks.length) {
    const fallback = raw.trim();
    if (!fallback) return '';
    const prefix = sectionTitle
      ? `\\textbf{${esc(sectionTitle)}}\n\\vspace{4pt}\n`
      : '';
    return `${prefix}\\begin{itemize}[leftmargin=*, nosep]\n\\item ${esc(fallback.slice(0, 12000))}\n\\end{itemize}\n\\vspace{12pt}`;
  }

  const parts: string[] = [];
  if (sectionTitle) {
    parts.push(`\\textbf{${esc(sectionTitle)}}`);
    parts.push('\\vspace{4pt}');
  }
  for (const block of blocks) {
    if (block.heading) parts.push(`\\textbf{${esc(block.heading)}}`);
    if (block.items.length) {
      parts.push(
        `\\begin{itemize}[leftmargin=*, nosep]\n${block.items.map((item) => `\\item ${esc(item)}`).join('\n')}\n\\end{itemize}`,
      );
    }
    parts.push('\\vspace{6pt}');
  }
  parts.push('\\vspace{6pt}');
  return parts.join('\n');
}

function formatSkillsLatex(skillsRaw: string): string {
  return formatCategorizedLatex(skillsRaw);
}

function formatTwoColumnExperience(experienceRaw: string): string {
  if (!experienceRaw.trim()) return '';
  const lines = experienceRaw.split('\n');
  const entries: { label: string; bullets: string[] }[] = [];
  let currentLabel = '';
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length > 0 || currentLabel) {
      entries.push({ label: currentLabel || 'Experience', bullets: [...bullets] });
      bullets = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (t.startsWith('- ') || t.startsWith('• ')) {
      bullets.push(t.replace(/^[-•]\s*/, '').trim());
      continue;
    }

    const metaMatch = t.match(/^(Technologies|Role|Duration|Type):\s*(.*)$/i);
    if (metaMatch) {
      bullets.push(`${metaMatch[1]}: ${metaMatch[2].trim()}`);
      continue;
    }

    const projectMatch = t.match(/^PROJECT:\s*(.*)$/i)
      || t.match(/^---\s*Project:\s*(.+?)---\s*$/i)
      || t.match(/^---\s*Project:\s*(.+)$/i);
    if (projectMatch) {
      flush();
      currentLabel = projectMatch[1]?.trim() || t;
      continue;
    }

    if (/^(PALO ALTO|INFOSYS|TATA|TCS|PROJECT:|CRITICAL|SECURITY|LEADERSHIP)/i.test(t) && t.length < 100) {
      flush();
      currentLabel = t;
      continue;
    }

    if (bullets.length === 0 && !currentLabel) {
      currentLabel = t;
    } else {
      bullets.push(t);
    }
  }
  flush();

  if (entries.length === 0) {
    return `\\textbf{Professional Experience}\n\\begin{itemize}[leftmargin=*, nosep]\n\\item ${esc(experienceRaw.slice(0, 12000))}\n\\end{itemize}`;
  }

  return entries.map((entry) => {
    const bulletList = entry.bullets.length
      ? `\\begin{itemize}[leftmargin=*, nosep]\n${entry.bullets.map((b) => `\\item ${esc(b)}`).join('\n')}\n\\end{itemize}`
      : '';
    return `\\textbf{${esc(entry.label)}}\n${bulletList}`;
  }).join('\n\n\\vspace{6pt}\n\n');
}

function formatTwoColumnBulletSection(title: string, raw: string): string {
  if (!raw.trim()) return '';
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const blocks: string[] = [`\\textbf{${esc(title)}}`, '\\vspace{4pt}'];
  let bullets: string[] = [];

  const flush = () => {
    if (!bullets.length) return;
    blocks.push(`\\begin{itemize}[leftmargin=*, nosep]\n${bullets.map((item) => `\\item ${esc(item)}`).join('\n')}\n\\end{itemize}`);
    bullets = [];
  };

  for (const line of lines) {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      bullets.push(line.replace(/^[-•]\s*/, '').trim());
      continue;
    }
    flush();
    blocks.push(`\\textbf{${esc(line)}}`);
  }
  flush();
  blocks.push('\\vspace{12pt}');
  return blocks.join('\n');
}

function appendModerncvSections(body: string[], sections: Record<string, string>): void {
  if (sections.summary) {
    body.push(`\\section{Summary}`);
    body.push(`\\cvitem{}{${esc(sections.summary.replace(/\n+/g, ' ').trim())}}`);
  }
  if (sections.skills) {
    body.push(`\\section{Skills}`);
    body.push(formatSkillsLatex(sections.skills));
  }
  if (sections.experience) {
    body.push(`\\section{Professional Experience}`);
    body.push(formatExperienceLatex(sections.experience));
  }
  if (sections.projects) {
    body.push(`\\section{Selected Projects}`);
    body.push(formatProjectsLatex(sections.projects));
  }
  if (sections.certification) {
    body.push(`\\section{Certification}`);
    body.push(formatCategorizedLatex(sections.certification));
  }
  if (sections.education) {
    body.push(`\\section{Education}`);
    body.push(`\\cvitem{}{${esc(sections.education.replace(/\n+/g, ' ').trim())}}`);
  }
}

function buildModerncvHeader(
  contactFields: Record<string, string>,
): string[] {
  const titleLine = contactFields.title || '';
  const email = contactFields.email || '';
  const phone = contactFields.phone || '';
  const location = contactFields.location || '';
  const linkedin = contactFields.linkedin || '';
  const github = contactFields.github || '';

  const headerLines: string[] = [];
  if (titleLine) headerLines.push(`\\quote{${esc(titleLine)}}`);
  if (phone) headerLines.push(`\\phone[mobile]{${esc(phone)}}`);
  if (email) headerLines.push(`\\email{${esc(email)}}`);
  if (location) headerLines.push(`\\address{${esc(location)}}{}`);
  if (linkedin) {
    headerLines.push(`\\social[linkedin]{${esc(extractLinkedInHandle(linkedin))}}`);
  }
  if (github) {
    headerLines.push(`\\social[github]{${esc(extractGitHubHandle(github))}}`);
  }
  return headerLines;
}

function buildClassicLatex(
  sections: Record<string, string>,
  contactFields: Record<string, string>,
  first: string,
  last: string,
): string {
  const body: string[] = [];
  appendModerncvSections(body, sections);

  return `\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{banking}
\\moderncvcolor{blue}
\\usepackage[scale=0.88]{geometry}
\\usepackage{enumitem}
\\name{${first}}{${last}}
${buildModerncvHeader(contactFields).join('\n')}
\\begin{document}
\\makecvtitle
${body.join('\n\n')}
\\end{document}`;
}

function buildModernSingleLatex(
  sections: Record<string, string>,
  contactFields: Record<string, string>,
  first: string,
  last: string,
): string {
  const body: string[] = [];
  appendModerncvSections(body, sections);

  // `casual` reserves a photo sidebar and breaks badly without an image.
  // `classic` keeps a clean single-column layout while still looking modern.
  return `\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{classic}
\\moderncvcolor{burgundy}
\\usepackage[scale=0.85,top=1.4cm,bottom=1.4cm]{geometry}
\\usepackage{enumitem}
\\name{${first}}{${last}}
${buildModerncvHeader(contactFields).join('\n')}
\\begin{document}
\\makecvtitle
${body.join('\n\n')}
\\end{document}`;
}

function buildModernTwoColumnLatex(
  sections: Record<string, string>,
  contactFields: Record<string, string>,
  first: string,
  last: string,
  targetRole: string,
): string {
  const titleLine = contactFields.title || targetRole || '';
  const email = contactFields.email || '';
  const phone = contactFields.phone || '';
  const location = contactFields.location || '';
  const linkedin = contactFields.linkedin || '';
  const github = contactFields.github || '';

  const leftColumn: string[] = [];
  leftColumn.push(`{\\LARGE\\bfseries ${first} ${last}}`);
  if (titleLine) leftColumn.push(`\\vspace{4pt}\n{\\large ${esc(titleLine)}}`);
  leftColumn.push('\\vspace{12pt}');

  if (email || phone || location || linkedin || github) {
    leftColumn.push(`\\textbf{Contact}`);
    leftColumn.push('\\vspace{4pt}');
    leftColumn.push('\\begin{itemize}[leftmargin=*, nosep]');
    if (email) leftColumn.push(`\\item \\href{mailto:${escUrl(email)}}{${esc(email)}}`);
    if (phone) leftColumn.push(`\\item ${esc(phone)}`);
    if (location) leftColumn.push(`\\item ${esc(location)}`);
    if (linkedin) {
      leftColumn.push(`\\item \\href{${escUrl(buildLinkedInUrl(linkedin))}}{LinkedIn}`);
    }
    if (github) {
      leftColumn.push(`\\item \\href{${escUrl(buildGitHubUrl(github))}}{GitHub}`);
    }
    leftColumn.push('\\end{itemize}');
    leftColumn.push('\\vspace{12pt}');
  }

  if (sections.skills) {
    leftColumn.push(formatCategorizedTwoColumn(sections.skills, 'Skills'));
  }

  if (sections.education) {
    leftColumn.push(`\\textbf{Education}`);
    leftColumn.push('\\vspace{4pt}');
    leftColumn.push(esc(sections.education.replace(/\n+/g, ' ').trim()));
    leftColumn.push('\\vspace{12pt}');
  }

  if (sections.certification) {
    leftColumn.push(formatCategorizedTwoColumn(sections.certification, 'Certifications'));
  }

  const rightColumn: string[] = [];
  if (sections.summary) {
    rightColumn.push(`\\textbf{Summary}`);
    rightColumn.push('\\vspace{4pt}');
    rightColumn.push(esc(sections.summary.replace(/\n+/g, ' ').trim()));
    rightColumn.push('\\vspace{12pt}');
  }

  if (sections.experience) {
    rightColumn.push(`\\textbf{Professional Experience}`);
    rightColumn.push('\\vspace{4pt}');
    rightColumn.push(formatTwoColumnExperience(sections.experience));
    rightColumn.push('\\vspace{12pt}');
  }

  if (sections.projects) {
    rightColumn.push(`\\textbf{Selected Projects}`);
    rightColumn.push('\\vspace{4pt}');
    rightColumn.push(formatTwoColumnProjects(sections.projects));
  }

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage[margin=1.5cm]{geometry}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true, linkcolor=black, urlcolor=black}
\\titleformat{\\section}{\\Large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{12pt}{6pt}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\pagestyle{empty}
\\begin{document}
\\noindent
\\begin{minipage}[t]{0.30\\textwidth}
\\raggedright
${leftColumn.join('\n')}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.66\\textwidth}
\\raggedright
${rightColumn.join('\n')}
\\end{minipage}
\\end{document}`;
}

export function buildLatexFromAtsText(raw: string, meta: ResumeLatexMeta = {}): string {
  const text = normalizeResumeTextForPdf(raw.trim());
  if (!text) {
    throw new Error('ATS optimizer returned empty resume text');
  }

  const nameSection = extractSection(text, 'NAME');
  const contactSection = extractSection(text, 'CONTACT');
  const summarySection = extractSection(text, 'SUMMARY')
    || extractSection(text, 'PROFESSIONAL SUMMARY');
  const skillsSection = extractSection(text, 'SKILLS')
    || extractSection(text, 'TECHNICAL SKILLS');
  const experienceSection = extractSection(text, 'PROFESSIONAL EXPERIENCE');
  const projectsSection = extractPersonalProjectsSection(text);
  const certificationSection = extractSection(text, 'CERTIFICATION')
    || extractSection(text, 'CERTIFICATIONS');
  const educationSection = extractSection(text, 'EDUCATION');

  const contactFields = parseContactFields(contactSection);
  let fullName = nameSection.split('\n').find((l) => l.trim())?.trim() || '';
  if (!fullName && contactFields.name) fullName = contactFields.name;
  if (!fullName) fullName = text.split('\n').find((l) => l.trim() && !/^(NAME|CONTACT|SUMMARY)/i.test(l))?.trim() || 'Your Name';

  const { first, last } = splitName(fullName);

  const sections = {
    summary: summarySection,
    skills: skillsSection,
    experience: experienceSection,
    projects: projectsSection,
    certification: certificationSection,
    education: educationSection,
  };

  if (!summarySection && !experienceSection && !projectsSection) {
    throw new Error(
      'Resume is missing SUMMARY, PROFESSIONAL EXPERIENCE, and SELECTED PROJECTS sections. Expected ALL CAPS headers or markdown ## headings.',
    );
  }

  const template = meta.template || 'classic';
  switch (template) {
    case 'modern_single':
      return buildModernSingleLatex(sections, contactFields, first, last);
    case 'modern_two_column':
      return buildModernTwoColumnLatex(sections, contactFields, first, last, meta.targetRole || '');
    case 'classic':
    default:
      return buildClassicLatex(sections, contactFields, first, last);
  }
}
