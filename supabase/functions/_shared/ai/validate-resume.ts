export function stripModelFences(text: string): string {
  return String(text || '')
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

const REQUIRED_HEADERS = ['NAME', 'CONTACT', 'SUMMARY', 'PROFESSIONAL EXPERIENCE', 'EDUCATION', 'SKILLS'];
const HEADER_ALIASES: Record<string, string> = {
  'PROFESSIONAL SUMMARY': 'SUMMARY',
  'EXECUTIVE SUMMARY': 'SUMMARY',
  'TECHNICAL SKILLS': 'SKILLS',
  'CORE COMPETENCIES': 'SKILLS',
  'WORK EXPERIENCE': 'PROFESSIONAL EXPERIENCE',
};
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
  text = text.split('\n').filter((line) => !SECTION_MARKER_RE.test(line.trim())).join('\n');
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

  const parts: string[] = [];
  for (const header of REQUIRED_HEADERS) {
    const body = sections.get(header)?.join('\n').trim();
    if (!body) continue;
    parts.push(header, body);
  }

  return parts.join('\n\n').trim();
}

function shouldSkipGroundingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (isRequiredHeader(trimmed)) return true;
  if (SECTION_MARKER_RE.test(trimmed)) return true;
  if (PROJECT_MARKER_RE.test(trimmed)) return true;
  if (/^technical highlights:/i.test(trimmed)) return true;
  if (/^role focus:/i.test(trimmed)) return true;
  return false;
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

function isGroundedLine(normalized: string, allowed: Set<string>): boolean {
  if (allowed.has(normalized)) return true;

  // Role banks and ATS output may use a truncated copy of a long summary or bullet.
  for (const candidate of allowed) {
    if (candidate.length >= 60 && candidate.startsWith(normalized)) return true;
  }

  return false;
}

function validateGrounding(text: string, groundingSource: string): { ok: true } | { ok: false; reason: string } {
  const allowedLines = buildAllowedResumeLines(groundingSource);
  const emittedLines = new Set<string>();

  for (const line of text.split('\n')) {
    if (shouldSkipGroundingLine(line)) continue;
    const normalized = normalizeResumeLine(line);
    if (!normalized) continue;
    if (!isGroundedLine(normalized, allowedLines)) {
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
  options?: { groundingSource?: string },
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = canonicalizeAtsResumeOutput(raw);
  if (!text || text.length < 40) {
    return { ok: false, reason: 'empty_or_too_short' };
  }

  for (const header of REQUIRED_HEADERS) {
    const headerCount = countRequiredHeaders(text)[header];
    if (headerCount !== 1) {
      return { ok: false, reason: headerCount ? 'duplicate_ats_section' : 'missing_ats_section' };
    }
  }

  // A generated resume must not introduce facts absent from the bullet catalog / master source.
  if (options?.groundingSource) {
    const grounding = validateGrounding(text, options.groundingSource);
    if (!grounding.ok) return grounding;
  }

  return { ok: true, text };
}
