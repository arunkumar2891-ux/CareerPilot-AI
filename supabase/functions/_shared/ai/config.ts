function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function getAiTimeoutMs(): number {
  return parsePositiveInt(Deno.env.get('AI_TIMEOUT_MS'), 30000, 120000);
}

/** ATS tailoring timeout. Keep under ~45s so two providers + corpus load stay within the 150s edge limit. */
export function getAtsTimeoutMs(): number {
  return parsePositiveInt(
    Deno.env.get('AI_ATS_TIMEOUT_MS') || Deno.env.get('GEMINI_ATS_TIMEOUT_MS'),
    40000,
    90000,
  );
}

export function getGeminiFallbackTimeoutMs(): number {
  return parsePositiveInt(Deno.env.get('AI_GEMINI_FALLBACK_TIMEOUT_MS'), 30000, 60000);
}

export function getGroqAtsTimeoutMs(): number {
  return parsePositiveInt(Deno.env.get('AI_GROQ_ATS_TIMEOUT_MS'), 25000, 60000);
}

/** Skip Groq when catalog assembly is available (saves ~25s on quota-hit paths). Set AI_FORCE_GROQ=true to keep Groq. */
export function isGroqResumeFallbackEnabled(): boolean {
  return Deno.env.get('AI_FORCE_GROQ')?.trim().toLowerCase() === 'true';
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

/** Paid Gemini fallback key is the only enabled LLM provider. */
export function getProviderChain(): string[] {
  return getGeminiFallbackApiKey() ? ['gemini_fallback'] : [];
}

/** LLM bullet rerank burns extra Gemini quota; off by default on free tier. */
export function isLlmRerankEnabled(): boolean {
  return Deno.env.get('AI_LLM_RERANK_ENABLED')?.trim().toLowerCase() === 'true';
}

/** Rerank, when enabled, also uses only the paid Gemini fallback key. */
export function getRerankProviderChain(): string[] {
  if (getGeminiFallbackApiKey()) return ['gemini_fallback'];
  return [];
}
