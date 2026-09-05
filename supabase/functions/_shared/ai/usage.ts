import { createAdminClient } from '../supabase-admin.ts';
import { estimateTokens } from './groq-limits.ts';
import type { AiProviderName } from './types.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export function estimateUsageTokens(systemPrompt: string, userPrompt: string, output: string): {
  tokensInput: number;
  tokensOutput: number;
  tokensTotal: number;
} {
  const tokensInput = estimateTokens(`${systemPrompt}\n${userPrompt}`);
  const tokensOutput = estimateTokens(output);
  return {
    tokensInput,
    tokensOutput,
    tokensTotal: tokensInput + tokensOutput,
  };
}

export function usageFromGeminiResponse(
  json: Record<string, unknown>,
  systemPrompt: string,
  userPrompt: string,
  output: string,
) {
  const meta = json.usageMetadata as Record<string, number> | undefined;
  if (meta?.totalTokenCount) {
    const tokensInput = Number(meta.promptTokenCount ?? 0);
    const tokensOutput = Number(meta.candidatesTokenCount ?? 0);
    return {
      tokensInput,
      tokensOutput,
      tokensTotal: Number(meta.totalTokenCount ?? tokensInput + tokensOutput),
    };
  }
  return estimateUsageTokens(systemPrompt, userPrompt, output);
}

export function usageFromGroqResponse(
  json: Record<string, unknown>,
  systemPrompt: string,
  userPrompt: string,
  output: string,
) {
  const usage = json.usage as Record<string, number> | undefined;
  if (usage?.total_tokens) {
    return {
      tokensInput: Number(usage.prompt_tokens ?? 0),
      tokensOutput: Number(usage.completion_tokens ?? 0),
      tokensTotal: Number(usage.total_tokens ?? 0),
    };
  }
  return estimateUsageTokens(systemPrompt, userPrompt, output);
}

export async function recordAiUsage(
  userId: string | undefined,
  event: {
    provider: AiProviderName;
    operation: string;
    tokensInput: number;
    tokensOutput: number;
  },
): Promise<void> {
  if (!userId) return;
  const tokensTotal = Math.max(0, event.tokensInput + event.tokensOutput);
  if (tokensTotal === 0) return;

  const admin = createAdminClient();
  await admin.from('ai_usage_events').insert({
    user_id: userId,
    provider: event.provider,
    operation: event.operation,
    tokens_input: event.tokensInput,
    tokens_output: event.tokensOutput,
    tokens_total: tokensTotal,
    credits_charged: tokensTotal,
  });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: monthRows } = await admin
    .from('ai_usage_events')
    .select('tokens_total')
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString());

  const monthCredits = (monthRows || []).reduce((sum, row) => sum + Number(row.tokens_total ?? 0), 0);

  await admin.from('profiles').update({
    ai_credits_used: monthCredits,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
}
