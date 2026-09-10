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
  return parsePositiveInt(Deno.env.get('AI_GEMINI_FALLBACK_TIMEOUT_MS'), 40000, 90000);
}

export function getGroqAtsTimeoutMs(): number {
  return parsePositiveInt(Deno.env.get('AI_GROQ_ATS_TIMEOUT_MS'), 25000, 60000);
}

/** Skip Groq unless explicitly enabled. Set AI_FORCE_GROQ=true to keep Groq in the chain. */
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

/** LLM bullet rerank burns extra Gemini quota; off by default. */
export function isLlmRerankEnabled(): boolean {
  return Deno.env.get('AI_LLM_RERANK_ENABLED')?.trim().toLowerCase() === 'true';
}

/** Paid Gemini fallback is the only rerank provider. */
export function getRerankProviderChain(): string[] {
  if (getGeminiFallbackApiKey()) return ['gemini_fallback'];
  return [];
}

/** Provider order: chat uses free Gemini then paid fallback; ATS skips free Gemini. */
export function getProviderChain(operation?: string): string[] {
  const chain: string[] = [];
  const skipFreeGemini = operation === 'resume_tailoring';
  if (!skipFreeGemini && getGeminiApiKey()) chain.push('gemini');
  if (getGeminiFallbackApiKey()) chain.push('gemini_fallback');
  const groqForResume = operation === 'resume_tailoring' && Boolean(getGroqApiKey());
  if ((groqForResume || isGroqResumeFallbackEnabled()) && getGroqApiKey()) chain.push('groq');
  return chain;
}
