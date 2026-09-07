import type { CatalogLine } from './resume-bullets.ts';
import { buildCatalogGroundingSource, catalogById, selectCatalogLines } from './resume-bullets.ts';
import { normalizeResumeLine } from '../ai/validate-resume.ts';

export interface SourceLockedResumeInput {
  contactBlock: string;
  summarySource: string;
  skillsSource: string;
  educationSource: string;
  rerankedBulletIds: string[];
  catalog: CatalogLine[];
}

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

function firstNonEmptyLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(Boolean) || '';
}

function resolveBulletIds(catalog: CatalogLine[], selectedIds: string[]): string[] {
  if (selectedIds.length > 0) return selectedIds;
  return catalog.filter((line) => line.isBullet).slice(0, 16).map((line) => line.id);
}

function reserveLines(text: string, usedLines: Set<string>): string {
  const kept: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const normalized = normalizeResumeLine(line);
    if (!normalized || usedLines.has(normalized)) continue;
    usedLines.add(normalized);
    kept.push(line);
  }
  return kept.join('\n');
}

function buildExperienceSection(catalog: CatalogLine[], selectedIds: string[], usedLines: Set<string>): string {
  const byId = catalogById(catalog);
  const indexById = new Map(catalog.map((line, index) => [line.id, index]));
  const lines: string[] = [];

  const pushLine = (text: string) => {
    const line = text.trim();
    if (!line) return;
    const normalized = normalizeResumeLine(line);
    if (!normalized || usedLines.has(normalized)) return;
    usedLines.add(normalized);
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
    for (const line of selectCatalogLines(catalog, resolveBulletIds(catalog, selectedIds))) {
      pushLine(line.isBullet ? `- ${line.text}` : line.text);
    }
  }

  return lines.join('\n');
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
  const usedLines = new Set<string>();
  const { name, contactLines } = parseContactBlock(input.contactBlock);
  let resolvedName = reserveLines(name, usedLines);
  if (!resolvedName) {
    const header = input.catalog.find((line) => !line.isBullet && line.text.length > 0 && line.text.length < 90);
    if (header) resolvedName = reserveLines(header.text, usedLines);
  }
  const contact = reserveLines(contactLines.join('\n'), usedLines);
  const summary = reserveLines(firstNonEmptyLine(input.summarySource), usedLines);
  const skills = reserveLines(input.skillsSource.trim(), usedLines);
  const education = reserveLines(input.educationSource.trim(), usedLines);
  const experience = buildExperienceSection(input.catalog, input.rerankedBulletIds, usedLines);

  const sections = [
    ['NAME', resolvedName],
    ['CONTACT', contact],
    ['SUMMARY', summary],
    ['SKILLS', skills],
    ['PROFESSIONAL EXPERIENCE', experience],
    ['EDUCATION', education],
  ];

  return sections
    .filter(([, body]) => Boolean(String(body || '').trim()))
    .map(([header, body]) => `${header}\n${body}`)
    .join('\n\n')
    .trim();
}
