import type { CatalogLine } from './resume-bullets.ts';
import { catalogById, selectCatalogLines } from './resume-bullets.ts';

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

function buildExperienceSection(catalog: CatalogLine[], selectedIds: string[]): string {
  const byId = catalogById(catalog);
  const indexById = new Map(catalog.map((line, index) => [line.id, index]));
  const emitted = new Set<string>();
  const lines: string[] = [];

  const pushLine = (text: string) => {
    const key = text.trim();
    if (!key || emitted.has(key)) return;
    emitted.add(key);
    lines.push(key);
  };

  for (const id of selectedIds) {
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
    for (const line of selectCatalogLines(catalog, selectedIds)) {
      pushLine(line.isBullet ? `- ${line.text}` : line.text);
    }
  }

  return lines.join('\n');
}

/** Build a source-locked ATS resume without an LLM — used when providers fail validation or quota. */
export function assembleSourceLockedResume(input: SourceLockedResumeInput): string {
  const { name, contactLines } = parseContactBlock(input.contactBlock);
  const summary = firstNonEmptyLine(input.summarySource);
  const skills = input.skillsSource.trim();
  const education = input.educationSource.trim();
  const experience = buildExperienceSection(input.catalog, input.rerankedBulletIds);

  const sections = [
    ['NAME', name],
    ['CONTACT', contactLines.join('\n')],
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
