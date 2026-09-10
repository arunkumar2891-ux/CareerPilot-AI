export function stripModelFences(text: string): string {
  return String(text || '')
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

const REQUIRED_HEADERS = ['NAME', 'CONTACT', 'SUMMARY', 'SKILLS', 'PROFESSIONAL EXPERIENCE', 'CERTIFICATION', 'EDUCATION'];
const OPTIONAL_HEADERS = new Set(['CERTIFICATION']);
const HEADER_ALIASES: Record<string, string> = {
  'PROFESSIONAL SUMMARY': 'SUMMARY',
  'EXECUTIVE SUMMARY': 'SUMMARY',
  'TECHNICAL SKILLS': 'SKILLS',
  'CORE COMPETENCIES': 'SKILLS',
  'WORK EXPERIENCE': 'PROFESSIONAL EXPERIENCE',
  CERTIFICATIONS: 'CERTIFICATION',
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
  mandatory?: { skillsSource?: string; educationSource?: string; certificationSource?: string },
): string {
  if (!mandatory?.skillsSource?.trim() && !mandatory?.educationSource?.trim() && !mandatory?.certificationSource?.trim()) {
    return text;
  }

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
  ensureSection('CERTIFICATION', mandatory?.certificationSource);
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

function isAggregateParaphraseOf(normalized: string, sourceText: string): boolean {
  const outputTokens = significantTokens(normalized);
  if (outputTokens.length < 4) return false;
  const sourceTokens = new Set(significantTokens(normalizeResumeLine(sourceText)));
  const shared = outputTokens.filter((token) => sourceTokens.has(token)).length;
  if (outputTokens.length <= 8) return shared >= 3 && shared / outputTokens.length >= 0.6;
  return shared >= 8 && shared / outputTokens.length >= 0.4;
}

function isGroundedLine(
  normalized: string,
  allowed: Set<string>,
  options?: { allowParaphrase?: boolean; allowAggregate?: boolean; sourceText?: string },
): boolean {
  if (allowed.has(normalized)) return true;

  for (const candidate of allowed) {
    if (candidate.length >= 60 && candidate.startsWith(normalized)) return true;
    if (normalized.length >= 40 && normalized.startsWith(candidate)) return true;
  }

  if (!options?.allowParaphrase) return false;
  if (options.sourceText && hasInventedNumericFact(normalized, options.sourceText)) return false;
  if (options.allowAggregate && options.sourceText && isAggregateParaphraseOf(normalized, options.sourceText)) {
    return true;
  }
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
      allowAggregate: current === 'SUMMARY'
        || current === 'SKILLS'
        || current === 'CERTIFICATION'
        || (current === 'PROFESSIONAL EXPERIENCE' && !/^\s*[-•]\s+/.test(line)),
      sourceText: groundingSource,
    })) {
      return { ok: false, reason: `unsupported_source_line: ${line.trim().slice(0, 180)}` };
    }
    if (emittedLines.has(normalized)) return { ok: false, reason: 'duplicate_source_line' };
    emittedLines.add(normalized);
  }
  return { ok: true };
}

const AI_CLICHE_RE = /\b(leveraged|utilized|spearheaded|orchestrated|synergized|cutting-edge|best-in-class|innovative solutions|cross-functional stakeholders|drove impactful results|results-driven|proven track record|highly skilled|robust ecosystem)\b/gi;
const FILLER_QUALIFIER_RE = /\b(successfully|effectively|proactively)\s+/gi;

function leadingVerb(line: string): string {
  const cleaned = line.replace(/^\s*[-•]\s*/, '').trim().toLowerCase();
  return cleaned.split(/[^a-z]+/)[0] || '';
}

export function validateHumanVoice(text: string): { ok: true } | { ok: false; reason: string } {
  const experience = extractSectionBody(text, 'PROFESSIONAL EXPERIENCE');
  const bullets = experience.split('\n').map((line) => line.trim()).filter((line) => /^\s*[-•]\s+/.test(line));
  const cliches = text.match(AI_CLICHE_RE) || [];
  if (cliches.length >= 3) return { ok: false, reason: 'ai_generated_voice' };
  if ((text.match(FILLER_QUALIFIER_RE) || []).length >= 4) return { ok: false, reason: 'ai_generated_voice' };

  if (bullets.length >= 6) {
    const verbs = bullets.map(leadingVerb).filter(Boolean);
    const counts = new Map<string, number>();
    for (const verb of verbs) counts.set(verb, (counts.get(verb) || 0) + 1);
    const top = Math.max(0, ...counts.values());
    if (top >= 5 && top / verbs.length >= 0.6) return { ok: false, reason: 'ai_generated_voice' };

    const lengths = bullets.map((line) => line.length);
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    if (max - min <= 12) return { ok: false, reason: 'ai_generated_voice' };
  }
  return { ok: true };
}

function countExperienceAchievementBullets(text: string): number {
  const experience = extractSectionBody(text, 'PROFESSIONAL EXPERIENCE');
  return experience.split('\n').filter((line) => isExperienceAchievementBullet(line)).length;
}

/** Role/date headers are not achievement bullets, even when the model prefixes them with "- ". */
function isRoleOrDateHeader(line: string): boolean {
  const body = line.replace(/^\s*[-•*]\s+/, '').trim();
  if (!body || body.length > 140) return false;
  if (/[.!?]\s*$/.test(body)) return false;
  const hasYear = /\b(19|20)\d{2}\b/.test(body);
  if (!hasYear) return false;
  const hasJobSep = /\s\|\s/.test(body) || /\s+[–—-]\s+/.test(body) || /\s+at\s+/i.test(body);
  const dateRange = /\b(19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current|now)\b/i;
  return dateRange.test(body) || hasJobSep;
}

function isExperienceAchievementBullet(line: string): boolean {
  if (!/^\s*[-•]\s+/.test(line)) return false;
  return !isRoleOrDateHeader(line);
}

function validateTwoPageShape(
  text: string,
  groundingSource?: string,
): { ok: true } | { ok: false; reason: string } {
  if (text.length > 10000) return { ok: false, reason: 'exceeds_two_page_budget' };
  if (/RECTIFICATION\s*&\s*ITERATION|ATS keyword reference|tailoring guide/i.test(text)) {
    return { ok: false, reason: 'master_bank_artifact' };
  }

  const summary = extractSectionBody(text, 'SUMMARY');
  const skills = extractSectionBody(text, 'SKILLS');
  const skillLines = skills.split('\n').map((line) => line.trim()).filter(Boolean);
  const experienceBullets = countExperienceAchievementBullets(text);
  const sourceBullets = groundingSource ? countExperienceAchievementBullets(groundingSource) : 0;
  const maxBullets = Math.max(22, sourceBullets);

  if (summary.length > 1400) return { ok: false, reason: 'summary_too_long' };
  if (skills.length > 2500 || skillLines.length > 10) return { ok: false, reason: 'skills_too_long' };
  if (experienceBullets > maxBullets) return { ok: false, reason: 'too_many_experience_bullets' };
  return { ok: true };
}

/** Same contract as LaTeX builder: ATS text must include SUMMARY and PROFESSIONAL EXPERIENCE. */
export function validateResumeOutput(
  raw: string,
  options?: {
    groundingSource?: string;
    skillsSource?: string;
    educationSource?: string;
    certificationSource?: string;
    skipGrounding?: boolean;
    skipTwoPageShape?: boolean;
    skipHumanVoice?: boolean;
    allowParaphrase?: boolean;
    identity?: { name?: string; contact?: string; education?: string };
  },
): { ok: true; text: string } | { ok: false; reason: string } {
  let text = canonicalizeAtsResumeOutput(raw);
  text = overlayIdentitySections(text, options?.identity);
  text = fillMandatorySections(text, {
    skillsSource: options?.skillsSource,
    educationSource: options?.educationSource || options?.identity?.education,
    certificationSource: options?.certificationSource,
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
  if (options?.certificationSource?.trim()) {
    rawHeaderCounts.CERTIFICATION = Math.max(rawHeaderCounts.CERTIFICATION, 1);
  }
  const headerCounts = countRequiredHeaders(text);
  for (const header of REQUIRED_HEADERS) {
    const headerCount = headerCounts[header];
    if (headerCount === 1) continue;
    if (headerCount > 1) return { ok: false, reason: 'duplicate_ats_section' };
    if (OPTIONAL_HEADERS.has(header) && !options?.certificationSource?.trim()) continue;
    return { ok: false, reason: rawHeaderCounts[header] ? 'empty_section' : 'missing_ats_section' };
  }

  for (const header of ['SKILLS', 'EDUCATION', 'SUMMARY', 'PROFESSIONAL EXPERIENCE'] as const) {
    if (!extractSectionBody(text, header)) {
      return { ok: false, reason: 'empty_section' };
    }
  }

  if (!options?.skipTwoPageShape) {
    const shape = validateTwoPageShape(text, options?.groundingSource);
    if (!shape.ok) return shape;
  }

  if (options?.groundingSource && !options?.skipGrounding) {
    const grounding = validateGrounding(text, options.groundingSource, {
      allowParaphrase: options.allowParaphrase ?? true,
    });
    if (!grounding.ok) return grounding;
  }

  if (!options?.skipHumanVoice) {
    const voice = validateHumanVoice(text);
    if (!voice.ok) return voice;
  }

  return { ok: true, text };
}
