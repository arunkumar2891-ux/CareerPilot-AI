import { classifyProviderFailure } from './errors.ts';
import { getGroqApiKey, getGroqModel } from './config.ts';
import { fitGroqPrompt, isGroqRequestTooLarge } from './groq-limits.ts';
import { ProviderError, type GenerateRequest, type ProviderAdapter } from './types.ts';
import { usageFromGroqResponse } from './usage.ts';

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

    let fitted = fitGroqPrompt(req.systemPrompt, req.userPrompt);
    const timeoutMs = req.timeoutMs ?? 30000;

    for (let attempt = 1; attempt <= 2; attempt++) {
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
            max_completion_tokens: fitted.maxCompletionTokens,
            reasoning_effort: 'low',
            messages: [
              { role: 'system', content: fitted.systemPrompt },
              { role: 'user', content: fitted.userPrompt },
            ],
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = String(json.error?.message || json.error?.code || `Groq HTTP ${res.status}`);
          if (attempt === 1 && isGroqRequestTooLarge(detail, res.status)) {
            fitted = fitGroqPrompt(fitted.systemPrompt, fitted.userPrompt.slice(0, Math.floor(fitted.userPrompt.length * 0.6)));
            continue;
          }
          throw classifyProviderFailure('groq', new Error(detail), res.status);
        }
        const message = json.choices?.[0]?.message;
        const text = String(message?.content || message?.reasoning || '').trim();
        if (!text) {
          throw classifyProviderFailure('groq', new Error('Groq returned an empty completion'));
        }
        const usage = usageFromGroqResponse(json, fitted.systemPrompt, fitted.userPrompt, text);
        return { text, tokensInput: usage.tokensInput, tokensOutput: usage.tokensOutput };
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
    }

    throw classifyProviderFailure('groq', new Error('Groq request too large after shrinking prompt'));
  },
};
