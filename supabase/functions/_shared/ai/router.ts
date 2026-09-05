import { getAiMaxRetries, getAiTimeoutMs, getAtsTimeoutMs, getFallbackProvider, getPrimaryProvider } from './config.ts';
import { sanitizeAiErrorMessage, shouldFallback } from './errors.ts';
import { geminiAdapter } from './gemini.ts';
import { groqAdapter } from './groq.ts';
import { ProviderError, type GenerateRequest, type ProviderAdapter } from './types.ts';
import { validateResumeOutput } from './validate-resume.ts';
import { recordAiUsage } from './usage.ts';

const defaultAdapters: Record<string, ProviderAdapter> = {
  gemini: geminiAdapter,
  groq: groqAdapter,
};

export type GenerateDeps = {
  adapters?: Record<string, ProviderAdapter>;
  primary?: string;
  fallback?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  userId?: string;
  log?: (message: string) => void;
};

function applyResumeValidation(
  provider: string,
  text: string,
  operation: GenerateRequest['operation'],
): string {
  if (operation !== 'resume_tailoring') return text;
  const checked = validateResumeOutput(text);
  if (!checked.ok) {
    throw new ProviderError({
      provider: provider === 'groq' ? 'groq' : 'gemini',
      message: `Resume output failed validation (${checked.reason})`,
      retryable: true,
      kind: 'invalid_output',
    });
  }
  return checked.text;
}

async function callAdapter(
  adapter: ProviderAdapter,
  req: GenerateRequest,
  role: 'primary' | 'fallback',
  log: (message: string) => void,
  userId?: string,
): Promise<string> {
  const started = Date.now();
  const prefix = role === 'fallback' ? '[AI] fallback ' : '[AI] ';
  log(`${prefix}provider=${adapter.name} operation=${req.operation} started`);
  try {
    const result = await adapter.generate(req);
    const text = applyResumeValidation(adapter.name, result.text, req.operation);
    await recordAiUsage(userId, {
      provider: adapter.name,
      operation: req.operation,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
    });
    log(`[AI] provider=${adapter.name} operation=${req.operation} success duration_ms=${Date.now() - started} tokens=${result.tokensInput + result.tokensOutput}`);
    return text;
  } catch (err) {
    const kind = err instanceof ProviderError ? err.kind : 'unknown';
    if (kind === 'timeout') {
      log(`[AI] provider=${adapter.name} operation=${req.operation} timeout duration_ms=${Date.now() - started}`);
    } else {
      log(
        `[AI] provider=${adapter.name} operation=${req.operation} failed kind=${kind} duration_ms=${Date.now() - started}`,
      );
    }
    throw err;
  }
}

async function tryProvider(
  adapter: ProviderAdapter,
  req: GenerateRequest,
  role: 'primary' | 'fallback',
  maxAttempts: number,
  log: (message: string) => void,
  userId?: string,
): Promise<string> {
  let lastErr: unknown;
  const attempts = Math.max(1, maxAttempts);
  for (let i = 1; i <= attempts; i++) {
    try {
      return await callAdapter(adapter, req, role, log, userId);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ProviderError && err.retryable;
      if (!retryable || i >= attempts) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Gemini primary, Groq fallback. Default is one attempt on primary, then fallback on
 * retryable errors or a missing Gemini key. HTTP 4xx (except 429) does not fall back.
 */
export async function generateWithProviders(
  req: Omit<GenerateRequest, 'timeoutMs'> & { timeoutMs?: number },
  deps: GenerateDeps = {},
): Promise<string> {
  const log = (message: string) => (deps.log ?? console.log)(sanitizeAiErrorMessage(message));
  const defaultTimeout = req.operation === 'resume_tailoring' ? getAtsTimeoutMs() : getAiTimeoutMs();
  const timeoutMs = req.timeoutMs ?? deps.timeoutMs ?? defaultTimeout;
  const request: GenerateRequest = { ...req, timeoutMs };
  const adapters = deps.adapters ?? defaultAdapters;
  const primaryName = (deps.primary ?? getPrimaryProvider()).toLowerCase();
  const fallbackName = (deps.fallback ?? getFallbackProvider()).toLowerCase();
  const primary = adapters[primaryName];
  const fallback = fallbackName !== primaryName ? adapters[fallbackName] : undefined;
  // Primary: one shot by default (AI_MAX_RETRIES=1). Extra retries stay on the same provider only if raised.
  const maxAttempts = deps.maxAttempts ?? Math.min(getAiMaxRetries(), 1);

  const errors: string[] = [];

  if (primary?.isConfigured()) {
    try {
      return await tryProvider(primary, request, 'primary', maxAttempts, log, deps.userId);
    } catch (err) {
      const message = err instanceof Error ? sanitizeAiErrorMessage(err.message) : String(err);
      errors.push(`${primary.name}: ${message}`);
      if (!shouldFallback(err) || !fallback?.isConfigured()) {
        throw err instanceof Error ? err : new Error(message);
      }
    }
  } else if (fallback?.isConfigured()) {
    log(`[AI] provider=${primaryName || 'gemini'} skipped kind=missing_key`);
  } else {
    throw new ProviderError({
      provider: (primary?.name ?? 'gemini') as 'gemini' | 'groq',
      message: 'No AI provider is configured (set GEMINI_API_KEY and/or GROQ_API_KEY)',
      retryable: false,
      kind: 'missing_key',
    });
  }

  if (fallback?.isConfigured()) {
    try {
      return await tryProvider(fallback, { ...request, timeoutMs: getAiTimeoutMs() }, 'fallback', 1, log, deps.userId);
    } catch (err) {
      const message = err instanceof Error ? sanitizeAiErrorMessage(err.message) : String(err);
      errors.push(`${fallback.name}: ${message}`);
      throw new Error(`All AI providers failed. ${errors.join(' | ')}`);
    }
  }

  throw new Error(
    errors.length
      ? `All AI providers failed. ${errors.join(' | ')}`
      : 'No AI provider is configured (set GEMINI_API_KEY and/or GROQ_API_KEY)',
  );
}

export async function generateText(
  req: Omit<GenerateRequest, 'timeoutMs'> & { timeoutMs?: number },
  deps: GenerateDeps = {},
): Promise<string> {
  return generateWithProviders(req, deps);
}

export function providerNames(): { primary: string; fallback: string } {
  return { primary: getPrimaryProvider(), fallback: getFallbackProvider() };
}
