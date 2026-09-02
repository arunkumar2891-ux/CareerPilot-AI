/** Approx tokens for Groq TPM budgeting (chars/4). */
export function estimateTokens(text: string): number {
  return Math.ceil(String(text || '').length / 4);
}

/** Free-tier Groq on_demand TPM is 8000. Input + max_completion_tokens must fit. */
export const GROQ_TPM_LIMIT = 8000;
export const GROQ_TPM_MARGIN = 200;
export const GROQ_MAX_COMPLETION_TOKENS = 2048;

export function fitGroqPrompt(
  systemPrompt: string,
  userPrompt: string,
  tpmLimit = GROQ_TPM_LIMIT,
): { systemPrompt: string; userPrompt: string; maxCompletionTokens: number } {
  const system = String(systemPrompt || '');
  let user = String(userPrompt || '');
  const completionCap = GROQ_MAX_COMPLETION_TOKENS;
  const inputBudget = tpmLimit - completionCap - GROQ_TPM_MARGIN;
  const systemTokens = estimateTokens(system);
  const userBudgetTokens = Math.max(256, inputBudget - systemTokens);
  const userBudgetChars = userBudgetTokens * 4;
  if (estimateTokens(user) > userBudgetTokens) {
    user = `${user.slice(0, userBudgetChars)}\n\n[truncated to fit Groq token limit — select only from the text above]`;
  }
  const inputTokens = estimateTokens(system) + estimateTokens(user);
  const maxCompletionTokens = Math.max(
    1024,
    Math.min(completionCap, tpmLimit - inputTokens - GROQ_TPM_MARGIN),
  );
  return { systemPrompt: system, userPrompt: user, maxCompletionTokens };
}

export function isGroqRequestTooLarge(message: string, status?: number): boolean {
  if (status === 413) return true;
  return /request too large|tokens per minute|tpm/i.test(message);
}
