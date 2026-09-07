import { getAiTimeoutMs, getAtsTimeoutMs, getGeminiMaxRetries, getProviderChain } from './config.ts';
import { sanitizeAiErrorMessage, shouldFallback } from './errors.ts';
import { assembleSourceLockedResume } from '../career-corpus/assemble-source-locked-resume.ts';
import { geminiAdapter, geminiFallbackAdapter } from './gemini.ts';
import { groqAdapter } from './groq.ts';
import { ProviderError, type GenerateRequest, type ProviderAdapter } from './types.ts';
import { validateResumeOutput } from './validate-resume.ts';
import { recordAiUsage } from './usage.ts';

const defaultAdapters: Record<string, ProviderAdapter> = {
  gemini: geminiAdapter,
  gemini_fallback: geminiFallbackAdapter,
  groq: groqAdapter,
};

export type GenerateDeps = {
  adapters?: Record<string, ProviderAdapter>;
  providerChain?: string[];
  timeoutMs?: number;
  maxAttempts?: number;
  userId?: string;
  log?: (message: string) => void;
};

function maxAttemptsForProvider(providerName: string): number {
  if (providerName === 'gemini' || providerName === 'gemini_fallback') {
    return getGeminiMaxRetries();
  }
  return 1;
}

function providerLabel(name: string): string {
  return name === 'gemini_fallback' ? 'gemini-fallback' : name;
}

function resolveValidationGrounding(provider: string, request: GenerateRequest): string | undefined {
  if (request.operation !== 'resume_tailoring') return request.groundingSource;
  // Validate Groq output against the full catalog — not the TPM-truncated prompt.
  if (provider === 'groq') return request.groundingSource;
  return request.groundingSource;
}

function applyResumeValidation(
  provider: string,
  text: string,
  request: GenerateRequest,
): string {
  if (request.operation !== 'resume_tailoring') return text;
  const checked = validateResumeOutput(text, {
    groundingSource: resolveValidationGrounding(provider, request),
    skillsSource: request.skillsSource,
    educationSource: request.educationSource,
  });
  if (!checked.ok) {
    const providerName = provider === 'groq' ? 'groq' : provider === 'gemini_fallback' ? 'gemini_fallback' : 'gemini';
    throw new ProviderError({
      provider: providerName,
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
  const label = providerLabel(adapter.name);
  const prefix = role === 'fallback' ? '[AI] fallback ' : '[AI] ';
  log(`${prefix}provider=${label} operation=${req.operation} started`);
  try {
    const result = await adapter.generate(req);
    const text = applyResumeValidation(adapter.name, result.text, req);
    await recordAiUsage(userId, {
      provider: adapter.name,
      operation: req.operation,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
    });
    log(`[AI] provider=${label} operation=${req.operation} success duration_ms=${Date.now() - started} tokens=${result.tokensInput + result.tokensOutput}`);
    return text;
  } catch (err) {
    const kind = err instanceof ProviderError ? err.kind : 'unknown';
    if (kind === 'timeout') {
      log(`[AI] provider=${label} operation=${req.operation} timeout duration_ms=${Date.now() - started}`);
    } else {
      log(
        `[AI] provider=${label} operation=${req.operation} failed kind=${kind} duration_ms=${Date.now() - started}`,
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

function tryDeterministicResume(
  request: GenerateRequest,
  log: (message: string) => void,
): string | null {
  if (request.operation !== 'resume_tailoring' || !request.deterministicResume) return null;

  const assembled = assembleSourceLockedResume(request.deterministicResume);
  const checked = validateResumeOutput(assembled, {
    skillsSource: request.skillsSource,
    educationSource: request.educationSource,
    skipGrounding: true,
  });
  if (!checked.ok) {
    log(`[AI] deterministic resume assembly failed validation (${checked.reason})`);
    return null;
  }

  log('[AI] deterministic resume assembly fallback success');
  return checked.text;
}

function formatAllProvidersFailed(errors: string[], deterministicReason?: string): string {
  const joined = errors.join(' | ');
  const deterministicNote = deterministicReason
    ? ` Catalog assembly also failed (${deterministicReason}).`
    : '';
  if (/quota exceeded|rate.?limit|free_tier|429/i.test(joined)) {
    const groqError = errors.find((e) => e.startsWith('groq:'))?.replace(/^groq:\s*/, '');
    if (groqError) {
      return `All Gemini keys exhausted or rate-limited. Groq fallback: ${groqError}${deterministicNote}`;
    }
    return `Gemini API quota reached. Check GEMINI_API_KEY is set on the primary account.${deterministicNote}`;
  }
  return `All AI providers failed. ${joined}${deterministicNote}`;
}

function splitProviderChain(chain: string[]): { geminiChain: string[]; tailChain: string[] } {
  const geminiChain = chain.filter((name) => name === 'gemini' || name === 'gemini_fallback');
  const tailChain = chain.filter((name) => name !== 'gemini' && name !== 'gemini_fallback');
  return { geminiChain, tailChain };
}

/**
 * Default chain: GEMINI_API_KEY → GEMINI_API_KEY_FALLBACK → GROQ_API_KEY.
 * One attempt per Gemini key by default (no sleep-retry on 429); deterministic resume assembly is last resort.
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
  const chain = deps.providerChain ?? getProviderChain();
  const errors: string[] = [];
  log(`[AI] provider chain: ${chain.map(providerLabel).join(' → ') || '(none)'}`);

  if (!chain.length) {
    throw new ProviderError({
      provider: 'gemini',
      message: 'No AI provider is configured (set GEMINI_API_KEY, GEMINI_API_KEY_FALLBACK, and/or GROQ_API_KEY)',
      retryable: false,
      kind: 'missing_key',
    });
  }

  const { geminiChain, tailChain } = splitProviderChain(chain);

  for (let index = 0; index < geminiChain.length; index++) {
    const providerName = geminiChain[index];
    const adapter = adapters[providerName];
    if (!adapter?.isConfigured()) {
      log(`[AI] provider=${providerLabel(providerName)} skipped kind=missing_key`);
      continue;
    }

    const role = index === 0 ? 'primary' : 'fallback';
    const attempts = deps.maxAttempts ?? maxAttemptsForProvider(providerName);

    try {
      return await tryProvider(adapter, { ...request, timeoutMs }, role, attempts, log, deps.userId);
    } catch (err) {
      const message = err instanceof Error ? sanitizeAiErrorMessage(err.message) : String(err);
      errors.push(`${providerLabel(providerName)}: ${message}`);
      const hasNext = geminiChain.slice(index + 1).some((name) => adapters[name]?.isConfigured());
      if (!shouldFallback(err) || !hasNext) break;
    }
  }

  if (request.operation === 'resume_tailoring') {
    const deterministic = tryDeterministicResume(request, log);
    if (deterministic) return deterministic;
  }

  for (let index = 0; index < tailChain.length; index++) {
    const providerName = tailChain[index];
    const adapter = adapters[providerName];
    if (!adapter?.isConfigured()) {
      log(`[AI] provider=${providerLabel(providerName)} skipped kind=missing_key`);
      continue;
    }

    const providerTimeout = providerName === 'groq' && req.operation === 'resume_tailoring'
      ? getAtsTimeoutMs()
      : timeoutMs;

    try {
      return await tryProvider(adapter, { ...request, timeoutMs: providerTimeout }, 'fallback', 1, log, deps.userId);
    } catch (err) {
      const message = err instanceof Error ? sanitizeAiErrorMessage(err.message) : String(err);
      errors.push(`${providerLabel(providerName)}: ${message}`);
      const hasNext = tailChain.slice(index + 1).some((name) => adapters[name]?.isConfigured());
      if (!shouldFallback(err) || !hasNext) break;
    }
  }

  let deterministicReason: string | undefined;
  if (request.operation === 'resume_tailoring' && request.deterministicResume) {
    const assembled = assembleSourceLockedResume(request.deterministicResume);
    const checked = validateResumeOutput(assembled, {
      skillsSource: request.skillsSource,
      educationSource: request.educationSource,
      skipGrounding: true,
    });
    if (!checked.ok) deterministicReason = checked.reason;
  }

  throw new Error(
    errors.length
      ? formatAllProvidersFailed(errors, deterministicReason)
      : 'No AI provider is configured (set GEMINI_API_KEY, GEMINI_API_KEY_FALLBACK, and/or GROQ_API_KEY)',
  );
}

export async function generateText(
  req: Omit<GenerateRequest, 'timeoutMs'> & { timeoutMs?: number },
  deps: GenerateDeps = {},
): Promise<string> {
  return generateWithProviders(req, deps);
}

export function providerNames(): { chain: string[] } {
  return { chain: getProviderChain() };
}
