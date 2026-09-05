/**
 * Approximate provider free-tier token budgets for reference (not enforced by the app).
 * Update these if your Google/Groq plan limits change.
 */
export const PROVIDER_FREE_TIER_MONTHLY_TOKENS = {
  gemini: 1_000_000,
  groq: 500_000,
} as const;

export const PROVIDER_LABELS: Record<'gemini' | 'groq', string> = {
  gemini: 'Gemini',
  groq: 'Groq',
};
