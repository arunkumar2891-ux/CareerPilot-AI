function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function getAiTimeoutMs(): number {
  return parsePositiveInt(Deno.env.get('AI_TIMEOUT_MS'), 30000, 120000);
}

/** ATS prompts are large; 30s often expires before Groq can help. Default 75s for Gemini tailoring only. */
export function getAtsTimeoutMs(): number {
  return parsePositiveInt(
    Deno.env.get('AI_ATS_TIMEOUT_MS') || Deno.env.get('GEMINI_ATS_TIMEOUT_MS'),
    75000,
    120000,
  );
}

export function getAiMaxRetries(): number {
  return parsePositiveInt(Deno.env.get('AI_MAX_RETRIES'), 1, 2);
}

/** Gemini: one attempt per key by default (fail fast → next key in chain). Set AI_GEMINI_RETRY_ENABLED=true to allow AI_MAX_RETRIES on Gemini. */
export function getGeminiMaxRetries(): number {
  if (Deno.env.get('AI_GEMINI_RETRY_ENABLED')?.trim().toLowerCase() === 'true') {
    return getAiMaxRetries();
  }
  return 1;
}

export function getPrimaryProvider(): string {
  return (Deno.env.get('AI_PRIMARY_PROVIDER') || 'gemini').trim().toLowerCase();
}

export function getFallbackProvider(): string {
  return (Deno.env.get('AI_FALLBACK_PROVIDER') || 'groq').trim().toLowerCase();
}

export function getGeminiModel(): string {
  return Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-3.6-flash';
}

export function getGroqModel(): string {
  return Deno.env.get('GROQ_MODEL')?.trim() || 'openai/gpt-oss-120b';
}

export function getGeminiApiKey(): string {
  return Deno.env.get('GEMINI_API_KEY')?.trim() || '';
}

/** Second Gemini account — used after primary Gemini quota/errors, before Groq. */
export function getGeminiFallbackApiKey(): string {
  return Deno.env.get('GEMINI_API_KEY_FALLBACK')?.trim() || '';
}

export function getGroqApiKey(): string {
  return Deno.env.get('GROQ_API_KEY')?.trim() || '';
}

/** Provider order: primary Gemini → fallback Gemini key → Groq. */
export function getProviderChain(): string[] {
  const chain: string[] = [];
  if (getGeminiApiKey()) chain.push('gemini');
  if (getGeminiFallbackApiKey()) chain.push('gemini_fallback');
  if (getGroqApiKey()) chain.push('groq');
  return chain;
}
