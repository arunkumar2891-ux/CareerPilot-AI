const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
const DEFAULT_GEMINI_TIMEOUT_MS = 180000;
const DEFAULT_GEMINI_ATS_TIMEOUT_MS = 180000;
const MAX_GEMINI_TIMEOUT_MS = 300000;

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_GEMINI_TIMEOUT_MS);
}

export function getGeminiModel(): string {
  const configured = Deno.env.get('GEMINI_MODEL')?.trim();
  return configured || DEFAULT_GEMINI_MODEL;
}

export function getGeminiTimeoutMs(): number {
  return parseTimeoutMs(Deno.env.get('GEMINI_TIMEOUT_MS'), DEFAULT_GEMINI_TIMEOUT_MS);
}

export function getGeminiAtsTimeoutMs(): number {
  return parseTimeoutMs(Deno.env.get('GEMINI_ATS_TIMEOUT_MS'), DEFAULT_GEMINI_ATS_TIMEOUT_MS);
}

export function geminiGenerateContentUrl(): string {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const model = getGeminiModel();
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function isGeminiTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('timed out');
}

async function callGeminiOnce(
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      geminiGenerateContentUrl(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.55,
          },
        }),
      },
    );
    const json = await res.json();
    if (!res.ok) {
      const detail = json.error?.message || JSON.stringify(json.error || json).slice(0, 300);
      throw new Error(detail || 'Gemini API error');
    }
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function callGeminiGenerateContent(
  systemPrompt: string,
  userPrompt: string,
  options?: { timeoutMs?: number; maxAttempts?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? getGeminiTimeoutMs();
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 1);
  let lastErr: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callGeminiOnce(systemPrompt, userPrompt, timeoutMs);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (!isGeminiTimeoutError(lastErr) || attempt >= maxAttempts) throw lastErr;
    }
  }

  throw lastErr ?? new Error('Gemini request failed');
}

export async function callGeminiAtsGenerateContent(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  return await callGeminiGenerateContent(systemPrompt, userPrompt, {
    timeoutMs: getGeminiAtsTimeoutMs(),
    maxAttempts: 2,
  });
}
