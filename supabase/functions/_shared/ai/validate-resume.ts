export function stripModelFences(text: string): string {
  return String(text || '')
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

const REQUIRED_HEADERS = ['NAME', 'CONTACT', 'SUMMARY', 'PROFESSIONAL EXPERIENCE', 'EDUCATION', 'SKILLS'];

function normalizeLine(text: string): string {
  return text
    .replace(/^\s*-\s*/, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isRequiredHeader(line: string): boolean {
  return REQUIRED_HEADERS.includes(line.trim().replace(/:$/, '').toUpperCase());
}

function validateGrounding(text: string, groundingSource: string): { ok: true } | { ok: false; reason: string } {
  const allowedLines = new Set(
    groundingSource
      .split('\n')
      .map(normalizeLine)
      .filter(Boolean),
  );
  const emittedLines = new Set<string>();

  for (const line of text.split('\n')) {
    const normalized = normalizeLine(line);
    if (!normalized || isRequiredHeader(line)) continue;
    if (!allowedLines.has(normalized)) return { ok: false, reason: 'unsupported_source_line' };
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
