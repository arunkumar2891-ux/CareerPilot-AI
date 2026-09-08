import type { CatalogLine } from './resume-bullets.ts';
import { buildCatalogGroundingSource, catalogById } from './resume-bullets.ts';
import { isAtsSectionHeaderLine } from '../ai/validate-resume.ts';

export interface SourceLockedResumeInput {
  contactBlock: string;
  summarySource: string;
  skillsSource: string;
  educationSource: string;
  rerankedBulletIds: string[];
  catalog: CatalogLine[];
}

const REQUIRED_SECTIONS = [
  'NAME',
  'CONTACT',
  'SUMMARY',
  'PROFESSIONAL EXPERIENCE',
  'SKILLS',
  'EDUCATION',
] as const;

const CONTACT_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  linkedin: 'LinkedIn',
  github: 'GitHub',
};

function parseContactBlock(contactBlock: string): { name: string; contactLines: string[] } {
  let name = '';
  const contactLines: string[] = [];

  for (const line of contactBlock.split('\n')) {
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (!value) continue;
    if (key === 'name') name = value;
    else if (CONTACT_FIELD_LABELS[key]) contactLines.push(`${CONTACT_FIELD_LABELS[key]}: ${value}`);
  }

  return { name, contactLines };
}

function isJunkResumeLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (isAtsSectionHeaderLine(trimmed)) return true;
  if (/^={5,}$/.test(trimmed)) return true;
  if (/\[careerpilot\]/i.test(trimmed) || /last synced/i.test(trimmed)) return true;
  if (/^rectification\s*&\s*iteration\s*:?$/i.test(trimmed)) return true;
  if (/^example\s*\(/i.test(trimmed)) return true;
  if (/^key achievements/i.test(trimmed)) return true;
  if (/^(duration|role|technologies|role focus)\s*:/i.test(trimmed)) return true;
  if (/^(location|phone|email|linkedin|github|panw start|name|title)\s*:/i.test(trimmed)) return true;
  return false;
}

function looksLikeJobTitleLine(text: string): boolean {
  return / \| /.test(text)
    && /\b(architect|engineer|developer|manager)\b/i.test(text)
    && !/\b(typescript|python|javascript|react|api|gcp|aws|snaplogic|kubernetes|rag)\b/i.test(text);
}

/** Section content must never be an ATS header line (e.g. the master resume's own `EDUCATION`). */
function isUsableContent(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !isJunkResumeLine(trimmed) && !looksLikeJobTitleLine(trimmed);
}

function firstUsableLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(isUsableContent) || '';
}

function stripHeaderLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim() || (!isAtsSectionHeaderLine(line) && !isJunkResumeLine(line)))
    .join('\n')
    .trim();
}

function fallbackSummary(catalog: CatalogLine[], summarySource: string): string {
  const fromSource = stripHeaderLines(summarySource)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => isUsableContent(line) && line.length >= 80);
  if (fromSource) return fromSource;
  const sourced = firstUsableLine(summarySource);
  if (sourced) return sourced;

  const paragraphs = catalog
    .filter((line) => !line.isBullet && isUsableContent(line.text) && line.text.length >= 80)
    .sort((a, b) => b.text.length - a.text.length);
  return paragraphs[0]?.text.trim() || 'Experienced software engineer.';
}

function looksLikeSkillLine(line: CatalogLine): boolean {
  if (!isUsableContent(line.text)) return false;
  if (line.isBullet && /[|,]/.test(line.text)) return true;
  if (line.isBullet && /\b(typescript|python|javascript|react|api|gcp|snaplogic|kubernetes|rag|llm)\b/i.test(line.text)) {
    return true;
  }
  if (!line.isBullet && line.text.trim().endsWith(':') && line.text.length < 60) return true;
  if (!line.isBullet && /[|,]/.test(line.text) && /\b(typescript|python|javascript|react|api|gcp|snaplogic)\b/i.test(line.text)) {
    return true;
  }
  return false;
}

function fallbackSkills(catalog: CatalogLine[], skillsSource: string): string {
  const stripped = stripHeaderLines(skillsSource);
  if (stripped && !/^location:/i.test(stripped)) return stripped;

  const skillish = catalog.filter(looksLikeSkillLine).slice(0, 18);
  return skillish
    .map((line) => (line.isBullet ? `- ${line.text}` : line.text))
    .join('\n');
}

function isExperienceHeader(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isJunkResumeLine(trimmed) || looksLikeJobTitleLine(trimmed)) return false;
  if (trimmed.length > 140) return false;
  if (/^---\s*(project|ai development)/i.test(trimmed) || /^project:/i.test(trimmed)) return true;
  if (trimmed === trimmed.toUpperCase() && /[A-Z]{3,}/.test(trimmed) && trimmed.length >= 6 && trimmed.length <= 60) {
    return true;
  }
  if (
    /\b(architect|engineer|developer|manager|lead)\b/i.test(trimmed)
    && trimmed.length < 90
    && !trimmed.includes('|')
    && !trimmed.endsWith(':')
  ) {
    return true;
  }
  return false;
}

function resolveBulletIds(catalog: CatalogLine[], selectedIds: string[]): string[] {
  const byId = catalogById(catalog);
  const selectedBullets = selectedIds.filter((id) => byId.get(id)?.isBullet).slice(0, 18);
  if (selectedBullets.length > 0) return selectedBullets;
  return catalog.filter((line) => line.isBullet).slice(0, 16).map((line) => line.id);
}

function buildExperienceSection(catalog: CatalogLine[], selectedIds: string[]): string {
  const byId = catalogById(catalog);
  const indexById = new Map(catalog.map((line, index) => [line.id, index]));
  const lines: string[] = [];
  const seen = new Set<string>();

  const pushLine = (text: string) => {
    const line = text.trim();
    if (!line || seen.has(line) || isJunkResumeLine(line)) return;
    seen.add(line);
    lines.push(line);
  };

  for (const id of resolveBulletIds(catalog, selectedIds)) {
    const line = byId.get(id);
    const index = indexById.get(id);
    if (!line?.isBullet || index === undefined) continue;

    for (let headerIndex = index - 1; headerIndex >= 0; headerIndex -= 1) {
      const candidate = catalog[headerIndex];
      if (candidate.isBullet) continue;
      if (isExperienceHeader(candidate.text)) {
        pushLine(candidate.text);
        break;
      }
      if (!isJunkResumeLine(candidate.text) && candidate.text.length >= 80) continue;
    }
    pushLine(`- ${line.text}`);
  }

  if (!lines.length) {
    for (const line of catalog.filter((entry) => entry.isBullet).slice(0, 12)) {
      pushLine(`- ${line.text}`);
    }
  }

  return lines.join('\n');
}

function fallbackCatalogHeader(catalog: CatalogLine[]): string {
  return catalog.find((line) => !line.isBullet && isUsableContent(line.text) && line.text.length < 90)?.text.trim()
    || 'Candidate';
}

function fallbackEducation(catalog: CatalogLine[], educationSource: string): string {
  const stripped = stripHeaderLines(educationSource);
  if (stripped) return stripped;
  return catalog.find((line) => (
    !line.isBullet
    && isUsableContent(line.text)
    && /b\.?tech|bachelor|university|degree/i.test(line.text)
  ))?.text.trim() || '';
}

function fallbackContact(catalog: CatalogLine[], contactLines: string[]): string {
  if (contactLines.length > 0) return contactLines.join('\n');
  return catalog
    .filter((line) => !line.isBullet && isUsableContent(line.text))
    .slice(1, 5)
    .map((line) => line.text)
    .join('\n');
}

export function buildDeterministicGroundingSource(input: SourceLockedResumeInput): string {
  return buildCatalogGroundingSource(input.catalog, [
    input.contactBlock,
    input.summarySource,
    input.skillsSource,
    input.educationSource,
  ]);
}

/** Build a source-locked ATS resume without an LLM — used when providers fail validation or quota. */
export function assembleSourceLockedResume(input: SourceLockedResumeInput): string {
  const { name, contactLines } = parseContactBlock(input.contactBlock);

  const bodies: Record<typeof REQUIRED_SECTIONS[number], string> = {
    NAME: name.trim() || fallbackCatalogHeader(input.catalog),
    CONTACT: fallbackContact(input.catalog, contactLines),
    SUMMARY: fallbackSummary(input.catalog, input.summarySource),
    SKILLS: fallbackSkills(input.catalog, input.skillsSource),
    'PROFESSIONAL EXPERIENCE': buildExperienceSection(input.catalog, input.rerankedBulletIds),
    EDUCATION: fallbackEducation(input.catalog, input.educationSource),
  };

  return REQUIRED_SECTIONS
    .map((header) => `${header}\n${bodies[header].trim()}`)
    .join('\n\n')
    .trim();
}
