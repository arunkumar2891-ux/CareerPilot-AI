const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
const DEFAULT_GEMINI_TIMEOUT_MS = 120000;

export function getGeminiModel(): string {
  const configured = Deno.env.get('GEMINI_MODEL')?.trim();
  return configured || DEFAULT_GEMINI_MODEL;
}

export function geminiGenerateContentUrl(): string {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const model = getGeminiModel();
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

export async function callGeminiGenerateContent(
  systemPrompt: string,
  userPrompt: string,
  timeoutMs = DEFAULT_GEMINI_TIMEOUT_MS,
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
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gemini API error');
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
