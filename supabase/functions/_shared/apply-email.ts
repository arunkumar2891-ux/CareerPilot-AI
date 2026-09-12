import { generateText } from './ai/router.ts';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const APPLY_EMAIL_PATTERNS = [
  /(?:apply|send|email|submit|forward|direct)\s+(?:your|to|at|resume|cv|application)/i,
  /mailto:/i,
  /(?:careers?|hiring|jobs|recruit|talent|apply|hr)@/i,
];

const GENERIC_NOISE = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'postmaster', 'webmaster', 'support', 'info', 'admin', 'help',
  'newsletter', 'marketing', 'unsubscribe', 'bounce',
]);

function isLikelyApplyEmail(email: string, context: string): boolean {
  const local = email.split('@')[0].toLowerCase();
  if (GENERIC_NOISE.has(local)) return false;

  const applyKeywords = ['career', 'hiring', 'job', 'recruit', 'talent', 'apply', 'hr', 'resume', 'cv'];
  if (applyKeywords.some((k) => local.includes(k))) return true;

  const emailIndex = context.toLowerCase().indexOf(email.toLowerCase());
  if (emailIndex === -1) return false;
  const surrounding = context.slice(
    Math.max(0, emailIndex - 200),
    Math.min(context.length, emailIndex + email.length + 200),
  );
  return APPLY_EMAIL_PATTERNS.some((p) => p.test(surrounding));
}

/**
 * Regex-only extraction — fast, no AI call.
 * Used in the pipeline during parse_apify_jobs.
 */
export function extractEmailFromText(text: string): string | null {
  if (!text) return null;
  const matches = text.match(EMAIL_REGEX);
  if (!matches || matches.length === 0) return null;

  for (const email of matches) {
    if (isLikelyApplyEmail(email, text)) return email.toLowerCase();
  }
  return null;
}

/**
 * Full extraction with Gemini fallback.
 * Used for batch extraction on existing jobs.
 */
export async function extractApplyEmail(
  jobDescription: string,
  company: string,
  userId: string,
): Promise<{ email: string | null; confidence: 'high' | 'low' }> {
  const regexResult = extractEmailFromText(jobDescription);
  if (regexResult) return { email: regexResult, confidence: 'high' };

  if (!jobDescription || jobDescription.length < 50) {
    return { email: null, confidence: 'low' };
  }

  try {
    const raw = await generateText(
      {
        operation: 'chat',
        systemPrompt: [
          'You are an expert at extracting contact information from job descriptions.',
          'Find the email address where candidates should send their application/resume.',
          'Return ONLY the email address, nothing else. If no apply email exists, return "NONE".',
          'Look for patterns like "send your resume to...", "apply by emailing...", "contact us at...", "careers@...", etc.',
          'Do NOT return generic emails like support@, info@, noreply@ unless they are explicitly for job applications.',
        ].join(' '),
        userPrompt: `Company: ${company}\n\nJob Description:\n${jobDescription.slice(0, 6000)}`,
      },
      { userId },
    );

    const cleaned = raw.trim().toLowerCase();
    if (cleaned === 'none' || !cleaned.includes('@')) {
      return { email: null, confidence: 'low' };
    }

    const emailMatch = cleaned.match(EMAIL_REGEX);
    if (emailMatch && emailMatch[0]) {
      return { email: emailMatch[0], confidence: 'low' };
    }

    return { email: null, confidence: 'low' };
  } catch {
    return { email: null, confidence: 'low' };
  }
}
