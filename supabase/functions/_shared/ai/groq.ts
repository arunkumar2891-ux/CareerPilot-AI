import { classifyProviderFailure } from './errors.ts';
import { getGroqApiKey, getGroqModel } from './config.ts';
import { ProviderError, type GenerateRequest, type ProviderAdapter } from './types.ts';

export const groqAdapter: ProviderAdapter = {
  name: 'groq',
  isConfigured() {
    return Boolean(getGroqApiKey());
  },
  async generate(req: GenerateRequest) {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      throw new ProviderError({
        provider: 'groq',
        message: 'GROQ_API_KEY not configured',
        retryable: false,
        kind: 'missing_key',
        status: 401,
      });
    }

    const timeoutMs = req.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: getGroqModel(),
          temperature: 0.55,
          max_completion_tokens: 8192,
          reasoning_effort: 'low',
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = json.error?.message || json.error?.code || `Groq HTTP ${res.status}`;
        throw classifyProviderFailure('groq', new Error(String(detail)), res.status);
      }
      const message = json.choices?.[0]?.message;
      const text = String(message?.content || message?.reasoning || '').trim();
      if (!text) {
        throw classifyProviderFailure('groq', new Error('Groq returned an empty completion'));
      }
      return text;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw classifyProviderFailure(
          'groq',
          new Error(`Groq request timed out after ${timeoutMs / 1000}s`),
        );
      }
      throw classifyProviderFailure('groq', err);
    } finally {
      clearTimeout(timer);
    }
  },
};
