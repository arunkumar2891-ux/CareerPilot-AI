import { estimateTokens, fitGroqPrompt, GROQ_MAX_COMPLETION_TOKENS, isGroqRequestTooLarge } from './groq-limits.ts';

Deno.test('fitGroqPrompt keeps input plus completion under TPM', () => {
  const system = 'sys '.repeat(200);
  const user = 'master bank '.repeat(20000);
  const fitted = fitGroqPrompt(system, user);
  const total = estimateTokens(fitted.systemPrompt) + estimateTokens(fitted.userPrompt) + fitted.maxCompletionTokens;
  if (total > 8000) throw new Error(`budget ${total}`);
  if (fitted.maxCompletionTokens > GROQ_MAX_COMPLETION_TOKENS) throw new Error('completion too high');
  if (!fitted.userPrompt.includes('truncated')) throw new Error('expected truncation');
});

Deno.test('isGroqRequestTooLarge matches TPM errors', () => {
  if (!isGroqRequestTooLarge('Request too large for model openai/gpt-oss-120b ... TPM: Limit 8000, Requested 14045')) {
    throw new Error('expected match');
  }
});
