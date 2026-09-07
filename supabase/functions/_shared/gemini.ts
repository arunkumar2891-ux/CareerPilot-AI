import { getAiTimeoutMs, getAtsTimeoutMs, getGeminiApiKey, getGeminiModel as configuredGeminiModel } from './ai/config.ts';
import { generateText } from './ai/router.ts';
import type { AiOperation } from './ai/types.ts';

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
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
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
  mandatorySections?: {
    skillsSource?: string;
    educationSource?: string;
    groqUserPrompt?: string;
  },
): Promise<string> {
  return await generateText({
    systemPrompt,
    userPrompt,
    groqUserPrompt: mandatorySections?.groqUserPrompt,
    operation: 'resume_tailoring',
    timeoutMs: getGeminiAtsTimeoutMs(),
    groundingSource,
    skillsSource: mandatorySections?.skillsSource,
    educationSource: mandatorySections?.educationSource,
  }, { userId });
}
