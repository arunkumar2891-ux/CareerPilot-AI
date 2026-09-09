import { getAiTimeoutMs, getAtsTimeoutMs, getGeminiFallbackApiKey, getGeminiModel as configuredGeminiModel } from './ai/config.ts';
import { generateText, generateWithProviders } from './ai/router.ts';
import { totalTokens, type AiOperation } from './ai/types.ts';

export function getGeminiModel(): string {
  return configuredGeminiModel();
}

export function getGeminiTimeoutMs(): number {
  return getAiTimeoutMs();
}

export function getGeminiAtsTimeoutMs(): number {
  return getAtsTimeoutMs();
}

export function geminiGenerateContentUrl(): string {
  const apiKey = getGeminiFallbackApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY_FALLBACK not configured');
  const model = getGeminiModel();
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

export async function callGeminiGenerateContent(
  systemPrompt: string,
  userPrompt: string,
  options?: { timeoutMs?: number; maxAttempts?: number; operation?: AiOperation; userId?: string },
): Promise<string> {
  return await generateText({
    systemPrompt,
    userPrompt,
    operation: options?.operation ?? 'chat',
    timeoutMs: options?.timeoutMs ?? getAiTimeoutMs(),
  }, { userId: options?.userId });
}

export async function callGeminiAtsGenerateContent(
  systemPrompt: string,
  userPrompt: string,
  userId?: string,
  groundingSource?: string,
  options?: {
    groqUserPrompt?: string;
    educationSource?: string;
    identity?: { name?: string; contact?: string; education?: string };
  },
): Promise<{ text: string; tokensTotal: number }> {
  const result = await generateWithProviders({
    systemPrompt,
    userPrompt,
    groqUserPrompt: options?.groqUserPrompt,
    operation: 'resume_tailoring',
    timeoutMs: getGeminiAtsTimeoutMs(),
    groundingSource,
    educationSource: options?.educationSource,
    identity: options?.identity,
  }, { userId });
  return { text: result.text, tokensTotal: totalTokens(result) };
}
