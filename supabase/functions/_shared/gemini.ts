import { getAiTimeoutMs, getGeminiApiKey, getGeminiModel as configuredGeminiModel } from './ai/config.ts';
import { generateText } from './ai/router.ts';
import type { AiOperation } from './ai/types.ts';

export function getGeminiModel(): string {
  return configuredGeminiModel();
}

export function getGeminiTimeoutMs(): number {
  return getAiTimeoutMs();
}

export function getGeminiAtsTimeoutMs(): number {
  return getAiTimeoutMs();
}

export function geminiGenerateContentUrl(): string {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const model = getGeminiModel();
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

export async function callGeminiGenerateContent(
  systemPrompt: string,
  userPrompt: string,
  options?: { timeoutMs?: number; maxAttempts?: number; operation?: AiOperation },
): Promise<string> {
  return await generateText({
    systemPrompt,
    userPrompt,
    operation: options?.operation ?? 'chat',
    timeoutMs: options?.timeoutMs ?? getAiTimeoutMs(),
  });
}

export async function callGeminiAtsGenerateContent(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  return await generateText({
    systemPrompt,
    userPrompt,
    operation: 'resume_tailoring',
    timeoutMs: getGeminiAtsTimeoutMs(),
  });
}
