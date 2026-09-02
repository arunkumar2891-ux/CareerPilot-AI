export function stripModelFences(text: string): string {
  return String(text || '')
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function hasHeader(text: string, header: string): boolean {
  const re = new RegExp(`(?:^|\\n)${header.replace(/ /g, '\\s+')}\\s*(?:\\n|:)`, 'i');
  return re.test(text);
}

/** Same contract as LaTeX builder: ATS text must include SUMMARY and PROFESSIONAL EXPERIENCE. */
export function validateResumeOutput(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  const text = stripModelFences(raw);
  if (!text || text.length < 40) {
    return { ok: false, reason: 'empty_or_too_short' };
  }
  const summary = hasHeader(text, 'SUMMARY') || hasHeader(text, 'PROFESSIONAL SUMMARY');
  const experience = hasHeader(text, 'PROFESSIONAL EXPERIENCE');
  if (!summary && !experience) {
    return { ok: false, reason: 'missing_ats_sections' };
  }
  if (!summary || !experience) {
    return { ok: false, reason: 'incomplete_ats_sections' };
  }
  return { ok: true, text };
}
