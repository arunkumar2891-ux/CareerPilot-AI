import type { CatalogLine } from './resume-bullets.ts';
import { buildCatalogGroundingSource, catalogById, selectCatalogLines } from './resume-bullets.ts';
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
  'SKILLS',
  'PROFESSIONAL EXPERIENCE',
  'EDUCATION',
] as const;

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
    else contactLines.push(value);
  }

  return { name, contactLines };
}

/** Section content must never be an ATS header line (e.g. the master resume's own `EDUCATION`). */
function isUsableContent(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !isAtsSectionHeaderLine(trimmed);
}

function firstUsableLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(isUsableContent) || '';
}

/** First catalog line matching `predicate` that is safe to use as section content. */
function findCatalogContent(
  catalog: CatalogLine[],
  predicate: (line: CatalogLine) => boolean,
): string {
  return catalog.find((line) => isUsableContent(line.text) && predicate(line))?.text.trim() || '';
}

function stripHeaderLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim() || !isAtsSectionHeaderLine(line))
    .join('\n')
    .trim();
}

function resolveBulletIds(catalog: CatalogLine[], selectedIds: string[]): string[] {
  if (selectedIds.length > 0) return selectedIds;
  return catalog.filter((line) => line.isBullet).slice(0, 16).map((line) => line.id);
}

function buildExperienceSection(catalog: CatalogLine[], selectedIds: string[]): string {
  const byId = catalogById(catalog);
  const indexById = new Map(catalog.map((line, index) => [line.id, index]));
  const lines: string[] = [];
  const seen = new Set<string>();

  const pushLine = (text: string) => {
    const line = text.trim();
    if (!line || seen.has(line) || isAtsSectionHeaderLine(line)) return;
    seen.add(line);
    lines.push(line);
  };

  for (const id of resolveBulletIds(catalog, selectedIds)) {
    const line = byId.get(id);
    const index = indexById.get(id);
    if (!line || index === undefined) continue;

    if (!line.isBullet) {
      pushLine(line.text);
      continue;
    }

    let headerIndex = index - 1;
    while (headerIndex >= 0 && catalog[headerIndex].isBullet) headerIndex -= 1;
    if (headerIndex >= 0) pushLine(catalog[headerIndex].text);
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
  return findCatalogContent(catalog, (line) => !line.isBullet && line.text.length < 90) || 'Candidate';
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
    SUMMARY: firstUsableLine(input.summarySource)
      || findCatalogContent(input.catalog, (line) => !line.isBullet && line.text.length >= 40)
      || firstUsableLine(input.skillsSource)
      || 'Experienced software engineer.',
    SKILLS: stripHeaderLines(input.skillsSource)
      || findCatalogContent(input.catalog, (line) => line.text.includes(',')),
    'PROFESSIONAL EXPERIENCE': buildExperienceSection(input.catalog, input.rerankedBulletIds),
    EDUCATION: stripHeaderLines(input.educationSource)
      || findCatalogContent(input.catalog, (line) => /b\.?tech|bachelor|university|degree/i.test(line.text)),
  };

  return REQUIRED_SECTIONS
    .map((header) => `${header}\n${bodies[header].trim()}`)
    .join('\n\n')
    .trim();
}
