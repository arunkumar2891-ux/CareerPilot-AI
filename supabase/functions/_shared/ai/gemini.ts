import { classifyProviderFailure } from './errors.ts';
import { getGeminiApiKey, getGeminiModel } from './config.ts';
import { ProviderError, type GenerateRequest, type ProviderAdapter } from './types.ts';
import { usageFromGeminiResponse } from './usage.ts';

export const geminiAdapter: ProviderAdapter = {
  name: 'gemini',
  isConfigured() {
    return Boolean(getGeminiApiKey());
  },
  async generate(req: GenerateRequest) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new ProviderError({
        provider: 'gemini',
        message: 'GEMINI_API_KEY not configured',
        retryable: false,
        kind: 'missing_key',
        status: 401,
      });
    }

    const model = getGeminiModel();
    const timeoutMs = req.timeoutMs ?? 30000;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: req.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: req.userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.55,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = json.error?.message || `Gemini HTTP ${res.status}`;
        throw classifyProviderFailure('gemini', new Error(detail), res.status);
      }
      const text = String(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
      const usage = usageFromGeminiResponse(json, req.systemPrompt, req.userPrompt, text);
      return { text, tokensInput: usage.tokensInput, tokensOutput: usage.tokensOutput };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw classifyProviderFailure(
          'gemini',
          new Error(`Gemini request timed out after ${timeoutMs / 1000}s`),
        );
      }
      throw classifyProviderFailure('gemini', err);
    } finally {
      clearTimeout(timer);
    }
  },
};
