export function stripModelFences(text: string): string {
  return String(text || '')
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

const REQUIRED_HEADERS = ['NAME', 'CONTACT', 'SUMMARY', 'PROFESSIONAL EXPERIENCE', 'EDUCATION', 'SKILLS'];
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

function isRequiredHeader(line: string): boolean {
  return REQUIRED_HEADERS.includes(line.trim().replace(/:$/, '').toUpperCase());
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
  const text = stripModelFences(raw);
  if (!text || text.length < 40) {
    return { ok: false, reason: 'empty_or_too_short' };
  }

  for (const header of REQUIRED_HEADERS) {
    const headerCount = (text.match(new RegExp(`(?:^|\\n)${header.replace(/ /g, '\\s+')}\\s*(?:\\n|:)`, 'gi')) || []).length;
    if (headerCount !== 1) {
      return { ok: false, reason: headerCount ? 'duplicate_ats_section' : 'missing_ats_section' };
    }
  }

  // A generated resume must not introduce facts absent from the user's Master ATS resume.
  if (options?.groundingSource) {
    const grounding = validateGrounding(text, options.groundingSource);
    if (!grounding.ok) return grounding;
  }

  return { ok: true, text };
}
