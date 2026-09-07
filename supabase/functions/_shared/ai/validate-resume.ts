export function stripModelFences(text: string): string {
  return String(text || '')
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

const REQUIRED_HEADERS = ['NAME', 'CONTACT', 'SUMMARY', 'SKILLS', 'PROFESSIONAL EXPERIENCE', 'EDUCATION'];
const HEADER_ALIASES: Record<string, string> = {
  'PROFESSIONAL SUMMARY': 'SUMMARY',
  'EXECUTIVE SUMMARY': 'SUMMARY',
  'TECHNICAL SKILLS': 'SKILLS',
  'CORE COMPETENCIES': 'SKILLS',
  'WORK EXPERIENCE': 'PROFESSIONAL EXPERIENCE',
};
const KEYWORD_REFERENCE_RE = /(?:^|\s)[\w\s/&.-]+\s+Keywords:/i;
const CONTACT_LINE_RE = /^(?:location|phone|email|linkedin|github|title|panw start)\s*:/i;
const LABEL_PREFIX_RE = /^(?:name|title|email|phone|location|linkedin|github|panw start|role focus):\s*/i;
const SECTION_MARKER_RE = /^={5,}$/;
const PROJECT_MARKER_RE = /^---\s+/;

export function normalizeResumeLine(text: string): string {
  return text
    .replace(/\\/g, '')
    .replace(/^\s*[-·•*]\s*/, '')
    .replace(LABEL_PREFIX_RE, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalHeader(line: string): string | null {
  const key = line.trim().replace(/:$/, '').replace(/\s+/g, ' ').toUpperCase();
  if (REQUIRED_HEADERS.includes(key)) return key;
  return HEADER_ALIASES[key] ?? null;
}

function isRequiredHeader(line: string): boolean {
  return canonicalHeader(line) !== null;
}

/**
 * True when a line is itself an ATS section header (including aliases like
 * `TECHNICAL SKILLS`). Such lines exist in the master resume and must never be
 * reused as section *content*, or they create duplicate headers.
 */
export function isAtsSectionHeaderLine(line: string): boolean {
  return isRequiredHeader(line);
}

function countRequiredHeaders(text: string): Record<string, number> {
  const counts = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, 0])) as Record<string, number>;
  for (const line of text.split('\n')) {
    const header = canonicalHeader(line);
    if (header) counts[header] += 1;
  }
  return counts;
}

function hasAllRequiredHeaders(text: string): boolean {
  const counts = countRequiredHeaders(text);
  return REQUIRED_HEADERS.every((header) => counts[header] === 1);
}

function splitPreamble(lines: string[]): { name: string[]; contact: string[] } {
  const name: string[] = [];
  const contact: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!name.length && trimmed.length < 90 && !trimmed.startsWith('-') && !CONTACT_LINE_RE.test(trimmed)) {
      name.push(trimmed);
      continue;
    }
    contact.push(trimmed);
  }

  return { name, contact };
}

/** Map legacy template output (PROFESSIONAL SUMMARY, === markers, etc.) to the strict ATS header contract. */
export function canonicalizeAtsResumeOutput(raw: string): string {
  let text = stripModelFences(raw);
  text = text.split('\n')
    .filter((line) => !SECTION_MARKER_RE.test(line.trim()))
    .filter((line) => !KEYWORD_REFERENCE_RE.test(line.trim()))
    .join('\n');
  if (hasAllRequiredHeaders(text)) return text.trim();

  const sections = new Map<string, string[]>();
  const preamble: string[] = [];
  let current: string | null = null;

  for (const line of text.split('\n')) {
    const header = canonicalHeader(line);
    if (header) {
      current = header;
      if (!sections.has(header)) sections.set(header, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else preamble.push(line);
  }

  if (!sections.has('NAME') || !sections.has('CONTACT')) {
    const { name, contact } = splitPreamble(preamble);
    if (!sections.has('NAME') && name.length) sections.set('NAME', name);
    if (!sections.has('CONTACT') && contact.length) sections.set('CONTACT', contact);
  }

  return joinSections(sections);
}

/** `HEADER\nbody`, blank line between sections — same shape the deterministic assembler emits. */
function joinSections(sections: Map<string, string[]>): string {
  const parts: string[] = [];
  for (const header of REQUIRED_HEADERS) {
    const body = sections.get(header)?.join('\n').trim();
    if (!body) continue;
    parts.push(`${header}\n${body}`);
  }
  return parts.join('\n\n').trim();
}

function fillMandatorySections(
  text: string,
  mandatory?: { skillsSource?: string; educationSource?: string },
): string {
  if (!mandatory?.skillsSource?.trim() && !mandatory?.educationSource?.trim()) return text;

  const sections = new Map<string, string[]>();
  const preamble: string[] = [];
  let current: string | null = null;

  for (const line of text.split('\n')) {
    const header = canonicalHeader(line);
    if (header) {
      current = header;
      if (!sections.has(header)) sections.set(header, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else preamble.push(line);
  }

  if (!sections.has('NAME') || !sections.has('CONTACT')) {
    const { name, contact } = splitPreamble(preamble);
    if (!sections.has('NAME') && name.length) sections.set('NAME', name);
    if (!sections.has('CONTACT') && contact.length) sections.set('CONTACT', contact);
  }

  const ensureSection = (header: string, source?: string) => {
    if (!source?.trim()) return;
    const body = sections.get(header)?.join('\n').trim();
    if (!body) sections.set(header, source.split('\n'));
  };

  ensureSection('SKILLS', mandatory?.skillsSource);
  ensureSection('EDUCATION', mandatory?.educationSource);

  return joinSections(sections);
}

function shouldSkipGroundingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (isRequiredHeader(trimmed)) return true;
  if (SECTION_MARKER_RE.test(trimmed)) return true;
  if (PROJECT_MARKER_RE.test(trimmed)) return true;
  if (/^technical highlights:/i.test(trimmed)) return true;
  if (/^role focus:/i.test(trimmed)) return true;
  if (KEYWORD_REFERENCE_RE.test(trimmed)) return true;
  return false;
}

function extractSectionBody(text: string, header: string): string {
  return parseAtsSections(text).get(header)?.join('\n').trim() || '';
}

export function extractAtsSection(text: string, header: string): string {
  return extractSectionBody(text, header);
}

function parseAtsSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  const preamble: string[] = [];
  let current: string | null = null;
  for (const line of text.split('\n')) {
    const header = canonicalHeader(line);
    if (header) {
      current = header;
      if (!sections.has(header)) sections.set(header, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
    else preamble.push(line);
  }
  if (!sections.has('NAME') || !sections.has('CONTACT')) {
    const { name, contact } = splitPreamble(preamble);
    if (!sections.has('NAME') && name.length) sections.set('NAME', name);
    if (!sections.has('CONTACT') && contact.length) sections.set('CONTACT', contact);
  }
  return sections;
}

function overlayIdentitySections(
  text: string,
  identity?: { name?: string; contact?: string; education?: string },
): string {
  if (!identity?.name && !identity?.contact && !identity?.education) return text;
  const sections = parseAtsSections(text);
  const apply = (header: string, value?: string) => {
    if (!value?.trim()) return;
    sections.set(header, value.split('\n'));
  };
  apply('NAME', identity.name);
  apply('CONTACT', identity.contact);
  apply('EDUCATION', identity.education);
  return joinSections(sections);
}

export function buildAllowedResumeLines(groundingSource: string): Set<string> {
  const allowed = new Set<string>();

  for (const rawLine of groundingSource.split('\n')) {
    const normalized = normalizeResumeLine(rawLine);
    if (!normalized) continue;
    allowed.add(normalized);

    const trimmed = rawLine.trim().replace(/\\/g, '');
    const labelMatch = trimmed.match(/^[A-Za-z][A-Za-z0-9\s]{0,30}:\s*(.+)$/);
    if (labelMatch?.[1]) {
      allowed.add(normalizeResumeLine(labelMatch[1]));
    }
  }

  return allowed;
}

const GROUNDING_STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'that', 'this', 'into', 'over', 'using', 'used',
  'a', 'an', 'of', 'to', 'in', 'on', 'by', 'as', 'or', 'at', 'via', 'per',
]);
const IDENTITY_HEADERS = new Set(['NAME', 'CONTACT', 'EDUCATION']);

function significantTokens(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length >= 3 && !GROUNDING_STOP_WORDS.has(token));
}

function extractNumericFacts(text: string): string[] {
  const facts: string[] = [];
  const matches = text.toLowerCase().match(/\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?(?:\+|x|%)?/g) || [];
  for (const match of matches) facts.push(match.replace(/\s+/g, ''));
  return facts;
}

function isParaphraseOf(normalized: string, allowed: Iterable<string>): boolean {
  const outTokens = significantTokens(normalized);
  if (!outTokens.length) return false;

  let best = 0;
  let bestShared = 0;
  for (const candidate of allowed) {
    const catalogTokens = significantTokens(candidate);
    if (!catalogTokens.length) continue;
    const catalogSet = new Set(catalogTokens);
    const shared = outTokens.filter((token) => catalogSet.has(token)).length;
    const score = Math.max(shared / outTokens.length, shared / catalogTokens.length);
    if (score > best) {
      best = score;
      bestShared = shared;
    }
  }

  if (best >= 0.5 && bestShared >= 3) return true;
  if (best >= 0.65 && bestShared >= 2) return true;
  if (outTokens.length <= 6 && best >= 0.5 && bestShared >= 1) return true;
  return false;
}

function hasInventedNumericFact(normalized: string, sourceText: string): boolean {
  const allowed = new Set(extractNumericFacts(sourceText));
  return extractNumericFacts(normalized).some((fact) => !allowed.has(fact));
}

function isGroundedLine(
  normalized: string,
  allowed: Set<string>,
  options?: { allowParaphrase?: boolean; sourceText?: string },
): boolean {
  if (allowed.has(normalized)) return true;

  for (const candidate of allowed) {
    if (candidate.length >= 60 && candidate.startsWith(normalized)) return true;
    if (normalized.length >= 40 && normalized.startsWith(candidate)) return true;
  }

  if (!options?.allowParaphrase) return false;
  if (options.sourceText && hasInventedNumericFact(normalized, options.sourceText)) return false;
  return isParaphraseOf(normalized, allowed);
}

function validateGrounding(
  text: string,
  groundingSource: string,
  options?: { allowParaphrase?: boolean },
): { ok: true } | { ok: false; reason: string } {
  const allowedLines = buildAllowedResumeLines(groundingSource);
  const emittedLines = new Set<string>();
  let current: string | null = null;

  for (const line of text.split('\n')) {
    const header = canonicalHeader(line);
    if (header) {
      current = header;
      continue;
    }
    if (current && IDENTITY_HEADERS.has(current)) continue;
    if (shouldSkipGroundingLine(line)) continue;
    const normalized = normalizeResumeLine(line);
    if (!normalized) continue;
    if (!isGroundedLine(normalized, allowedLines, {
      allowParaphrase: options?.allowParaphrase,
      sourceText: groundingSource,
    })) {
      return { ok: false, reason: 'unsupported_source_line' };
    }
    if (emittedLines.has(normalized)) return { ok: false, reason: 'duplicate_source_line' };
    emittedLines.add(normalized);
  }
  return { ok: true };
}

/** Same contract as LaTeX builder: ATS text must include SUMMARY and PROFESSIONAL EXPERIENCE. */
export function validateResumeOutput(
  raw: string,
  options?: {
    groundingSource?: string;
    skillsSource?: string;
    educationSource?: string;
    skipGrounding?: boolean;
    allowParaphrase?: boolean;
    identity?: { name?: string; contact?: string; education?: string };
  },
): { ok: true; text: string } | { ok: false; reason: string } {
  let text = canonicalizeAtsResumeOutput(raw);
  text = overlayIdentitySections(text, options?.identity);
  text = fillMandatorySections(text, {
    skillsSource: options?.skillsSource,
    educationSource: options?.educationSource || options?.identity?.education,
  });
  if (!text || text.length < 40) {
    return { ok: false, reason: 'empty_or_too_short' };
  }

  const rawHeaderCounts = countRequiredHeaders(stripModelFences(raw));
  if (options?.identity?.name) rawHeaderCounts.NAME = Math.max(rawHeaderCounts.NAME, 1);
  if (options?.identity?.contact) rawHeaderCounts.CONTACT = Math.max(rawHeaderCounts.CONTACT, 1);
  if (options?.identity?.education || options?.educationSource) {
    rawHeaderCounts.EDUCATION = Math.max(rawHeaderCounts.EDUCATION, 1);
  }
  const headerCounts = countRequiredHeaders(text);
  for (const header of REQUIRED_HEADERS) {
    const headerCount = headerCounts[header];
    if (headerCount === 1) continue;
    if (headerCount > 1) return { ok: false, reason: 'duplicate_ats_section' };
    return { ok: false, reason: rawHeaderCounts[header] ? 'empty_section' : 'missing_ats_section' };
  }

  for (const header of ['SKILLS', 'EDUCATION', 'SUMMARY', 'PROFESSIONAL EXPERIENCE'] as const) {
    if (!extractSectionBody(text, header)) {
      return { ok: false, reason: 'empty_section' };
    }
  }

  if (options?.groundingSource && !options?.skipGrounding) {
    const grounding = validateGrounding(text, options.groundingSource, {
      allowParaphrase: options.allowParaphrase,
    });
    if (!grounding.ok) return grounding;
  }

  return { ok: true, text };
}
