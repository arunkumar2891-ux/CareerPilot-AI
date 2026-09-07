import { normalizeResumeLine } from '../ai/validate-resume.ts';

export type BulletRetrievalSource = 'master' | 'evidence' | 'role_bank' | 'lexical';

export interface CatalogLine {
  id: string;
  text: string;
  isBullet: boolean;
  normalized: string;
}

export interface ScoredBullet {
  id: string;
  text: string;
  isBullet: boolean;
  score: number;
  sources: BulletRetrievalSource[];
}

export interface EvidenceMatch {
  id: string;
  text: string;
  catalogId: string | null;
  tags: string[];
}

const BULLET_PREFIX_RE = /^\s*[-·•*]\s*/;
const SKIP_LINE_RE = /^={5,}$/;

function parseCatalogLine(raw: string): { text: string; isBullet: boolean } | null {
  const trimmed = raw.trim().replace(/\\/g, '');
  if (!trimmed || SKIP_LINE_RE.test(trimmed)) return null;
  if (BULLET_PREFIX_RE.test(trimmed)) {
    return { text: trimmed.replace(BULLET_PREFIX_RE, '').trim(), isBullet: true };
  }
  return { text: trimmed, isBullet: false };
}

/** Build a stable ID-indexed catalog from the full master resume (source of truth). */
export function buildBulletCatalog(fullMaster: string): CatalogLine[] {
  const catalog: CatalogLine[] = [];
  let counter = 1;

  for (const raw of fullMaster.split('\n')) {
    const parsed = parseCatalogLine(raw);
    if (!parsed || parsed.text.length < 2) continue;
    const id = `B${String(counter).padStart(3, '0')}`;
    counter += 1;
    catalog.push({
      id,
      text: parsed.text,
      isBullet: parsed.isBullet,
      normalized: normalizeResumeLine(parsed.isBullet ? `- ${parsed.text}` : parsed.text),
    });
  }

  return catalog;
}

export function catalogById(catalog: CatalogLine[]): Map<string, CatalogLine> {
  return new Map(catalog.map((line) => [line.id, line]));
}

export function catalogByNormalized(catalog: CatalogLine[]): Map<string, CatalogLine> {
  const map = new Map<string, CatalogLine>();
  for (const line of catalog) {
    if (!map.has(line.normalized)) map.set(line.normalized, line);
  }
  return map;
}

function linesInText(text: string, catalog: CatalogLine[]): CatalogLine[] {
  const byNorm = catalogByNormalized(catalog);
  const found: CatalogLine[] = [];
  const seen = new Set<string>();

  for (const raw of text.split('\n')) {
    const parsed = parseCatalogLine(raw);
    if (!parsed) continue;
    const norm = normalizeResumeLine(parsed.isBullet ? `- ${parsed.text}` : parsed.text);
    const hit = byNorm.get(norm);
    if (hit && !seen.has(hit.id)) {
      seen.add(hit.id);
      found.push(hit);
    }
  }
  return found;
}

function scoreBullet(
  line: CatalogLine,
  sources: BulletRetrievalSource[],
  jdTerms: string[],
): ScoredBullet {
  const hay = line.normalized;
  const termHits = jdTerms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0);
  const sourceScore = (sources.includes('role_bank') ? 4 : 0)
    + (sources.includes('lexical') ? 3 : 0)
    + (sources.includes('evidence') ? 3 : 0)
    + (sources.includes('master') ? 1 : 0);
  return {
    id: line.id,
    text: line.text,
    isBullet: line.isBullet,
    score: sourceScore + termHits,
    sources: [...new Set(sources)],
  };
}

export function scoreRetrievalCandidates(input: {
  catalog: CatalogLine[];
  roleBankText: string;
  lexicalMatches: string;
  evidenceChunks: { id: string; tags: string[]; text: string }[];
  jobDescription: string;
  retrievalTerms: string[];
}): ScoredBullet[] {
  const sourceMap = new Map<string, BulletRetrievalSource[]>();

  const addSource = (line: CatalogLine, source: BulletRetrievalSource) => {
    const existing = sourceMap.get(line.id) || [];
    if (!existing.includes(source)) existing.push(source);
    sourceMap.set(line.id, existing);
  };

  for (const line of input.catalog) addSource(line, 'master');
  for (const line of linesInText(input.roleBankText, input.catalog)) addSource(line, 'role_bank');
  for (const line of linesInText(input.lexicalMatches, input.catalog)) addSource(line, 'lexical');

  const byNorm = catalogByNormalized(input.catalog);
  for (const chunk of input.evidenceChunks) {
    const norm = normalizeResumeLine(`- ${chunk.text}`);
    const hit = byNorm.get(norm) || byNorm.get(normalizeResumeLine(chunk.text));
    if (hit) addSource(hit, 'evidence');
  }

  const scored = input.catalog
    .filter((line) => sourceMap.has(line.id))
    .map((line) => scoreBullet(line, sourceMap.get(line.id) || ['master'], input.retrievalTerms))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return scored;
}

export function matchEvidenceToCatalog(
  evidenceChunks: { id: string; tags: string[]; text: string }[],
  catalog: CatalogLine[],
): EvidenceMatch[] {
  const byNorm = catalogByNormalized(catalog);
  return evidenceChunks.map((chunk) => {
    const norm = normalizeResumeLine(`- ${chunk.text}`);
    const hit = byNorm.get(norm) || byNorm.get(normalizeResumeLine(chunk.text));
    return {
      id: chunk.id,
      text: chunk.text,
      catalogId: hit?.id ?? null,
      tags: chunk.tags,
    };
  });
}

export function formatBulletCatalogBlock(lines: CatalogLine[], title = 'BULLET CATALOG'): string {
  if (!lines.length) return '';
  const body = lines.map((line) => {
    const prefix = line.isBullet ? '- ' : '';
    return `[${line.id}] ${prefix}${line.text}`;
  }).join('\n');
  return `${title} (copy text verbatim; IDs are for selection only — do not print IDs in output):\n${body}`;
}

export function formatRetrievedEvidenceBlock(matches: EvidenceMatch[]): string {
  if (!matches.length) return '';
  const body = matches.map((match) => {
    const ref = match.catalogId ? ` → catalog ${match.catalogId}` : ' → verify against catalog';
    const tags = match.tags.length ? ` (${match.tags.join(', ')})` : '';
    return `[${match.catalogId || match.id}] - ${match.text}${tags}${ref}`;
  }).join('\n');
  return `RETRIEVED EVIDENCE (JD-matched metric bullets — prioritize these in PROFESSIONAL EXPERIENCE when present in RERANKED SELECTION):\n${body}`;
}

export function formatRerankedSelection(ids: string[]): string {
  if (!ids.length) return '';
  return `RERANKED SELECTION (priority order for this JD — prefer bullets in this sequence):\n${ids.join(', ')}`;
}

/** Grounding text shared by validation — every catalog line, both bullet and plain forms. */
export function buildCatalogGroundingSource(
  catalog: CatalogLine[],
  extraBlocks: string[] = [],
): string {
  const lines: string[] = [];
  for (const entry of catalog) {
    if (entry.isBullet) {
      lines.push(`- ${entry.text}`);
      lines.push(entry.text);
    } else {
      lines.push(entry.text);
    }
  }
  return [...lines, ...extraBlocks.filter(Boolean)].join('\n');
}

export function selectCatalogLines(catalog: CatalogLine[], ids: string[]): CatalogLine[] {
  const byId = catalogById(catalog);
  return ids.map((id) => byId.get(id)).filter((line): line is CatalogLine => Boolean(line));
}
