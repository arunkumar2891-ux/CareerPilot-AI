const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

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
