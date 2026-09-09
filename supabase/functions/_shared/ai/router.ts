import { getAiTimeoutMs, getAtsTimeoutMs, getGeminiFallbackTimeoutMs, getGeminiMaxRetries, getGroqAtsTimeoutMs, getProviderChain } from './config.ts';
import { sanitizeAiErrorMessage, shouldFallback } from './errors.ts';
import { geminiAdapter, geminiFallbackAdapter } from './gemini.ts';
import { groqAdapter } from './groq.ts';
import { ProviderError, totalTokens, type GenerateRequest, type GenerateResult, type ProviderAdapter } from './types.ts';
import { validateResumeOutput } from './validate-resume.ts';
import { recordAiUsage } from './usage.ts';
import { HUMANIZE_RETRY_PROMPT } from '../career-corpus/prompt.ts';

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

function shouldRetrySameProvider(err: unknown): boolean {
  if (!(err instanceof ProviderError) || !err.retryable) return false;
  // Never burn wall-clock on quota, validation, or timeout — fall through to the next provider.
  if (['rate_limit', 'invalid_output', 'timeout', 'http_429'].includes(err.kind)) return false;
  return true;
}

function timeoutForProvider(providerName: string, operation: string, defaultTimeout: number): number {
  if (operation !== 'resume_tailoring') return defaultTimeout;
  if (providerName === 'gemini_fallback') return getGeminiFallbackTimeoutMs();
  if (providerName === 'groq') return getGroqAtsTimeoutMs();
  return getAtsTimeoutMs();
}

function maxAttemptsForProvider(providerName: string): number {
  if (providerName === 'gemini' || providerName === 'gemini_fallback') {
    return getGeminiMaxRetries();
  }
  return 1;
}

function providerLabel(name: string): string {
  return name === 'gemini_fallback' ? 'gemini-fallback' : name;
}

function logRejectedGeminiResponse(
  adapter: ProviderAdapter,
  request: GenerateRequest,
  text: string,
  log: (message: string) => void,
): void {
  if (request.operation !== 'resume_tailoring') return;
  if (adapter.name !== 'gemini' && adapter.name !== 'gemini_fallback') return;

  // Edge log entries have size limits. JSON-encoding independently numbered
  // chunks preserves newlines and lets the complete rejected response be rebuilt.
  const chunkSize = 3500;
  const total = Math.max(1, Math.ceil(text.length / chunkSize));
  for (let index = 0; index < total; index++) {
    const chunk = text.slice(index * chunkSize, (index + 1) * chunkSize);
    log(
      `[AI] provider=${providerLabel(adapter.name)} operation=${request.operation} raw_response chunk=${index + 1}/${total} ${JSON.stringify(chunk)}`,
    );
  }
}

function identityFromRequest(request: GenerateRequest): {
  name?: string;
  contact?: string;
  education?: string;
} | undefined {
  if (request.operation !== 'resume_tailoring') return undefined;
  if (request.identity) return request.identity;
  if (request.educationSource) return { education: request.educationSource };
  return undefined;
}

function applyResumeValidation(
  provider: string,
  text: string,
  request: GenerateRequest,
): string {
  if (request.operation !== 'resume_tailoring') return text;
  const checked = validateResumeOutput(text, {
    groundingSource: request.groundingSource,
    skillsSource: request.skillsSource,
    educationSource: request.educationSource,
    certificationSource: request.certificationSource,
    skipTwoPageShape: request.skipTwoPageShape,
    skipHumanVoice: request.skipHumanVoice,
    allowParaphrase: true,
    identity: identityFromRequest(request),
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
): Promise<GenerateResult> {
  const started = Date.now();
  const label = providerLabel(adapter.name);
  const prefix = role === 'fallback' ? '[AI] fallback ' : '[AI] ';
  log(`${prefix}provider=${label} operation=${req.operation} started`);
  try {
    const result = await adapter.generate(req);
    let text: string;
    try {
      text = applyResumeValidation(adapter.name, result.text, req);
    } catch (err) {
      if (err instanceof ProviderError && err.kind === 'invalid_output') {
        logRejectedGeminiResponse(adapter, req, result.text, log);
      }
      throw err;
    }
    await recordAiUsage(userId, {
      provider: adapter.name,
      operation: req.operation,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
    });
    const tokens = totalTokens(result);
    log(`[AI] provider=${label} operation=${req.operation} success duration_ms=${Date.now() - started} tokens=${tokens}`);
    return { text, tokensInput: result.tokensInput, tokensOutput: result.tokensOutput };
  } catch (err) {
    const kind = err instanceof ProviderError ? err.kind : 'unknown';
    const detail = err instanceof ProviderError ? ` ${err.message}` : '';
    if (kind === 'timeout') {
      log(`[AI] provider=${label} operation=${req.operation} timeout duration_ms=${Date.now() - started}`);
    } else {
      log(
        `[AI] provider=${label} operation=${req.operation} failed kind=${kind} duration_ms=${Date.now() - started}${kind === 'invalid_output' ? detail : ''}`,
      );
    }
    throw err;
  }
}

function withHumanizeRetry(req: GenerateRequest, err: unknown): GenerateRequest {
  const message = err instanceof Error ? err.message : String(err);
  if (!/ai_generated_voice/.test(message)) return req;
  if (req.userPrompt.includes(HUMANIZE_RETRY_PROMPT)) return req;
  return {
    ...req,
    userPrompt: `${req.userPrompt}\n\n${HUMANIZE_RETRY_PROMPT}`,
    groqUserPrompt: req.groqUserPrompt
      ? `${req.groqUserPrompt}\n\n${HUMANIZE_RETRY_PROMPT}`
      : req.groqUserPrompt,
  };
}

async function tryProvider(
  adapter: ProviderAdapter,
  req: GenerateRequest,
  role: 'primary' | 'fallback',
  maxAttempts: number,
  log: (message: string) => void,
  userId?: string,
): Promise<GenerateResult> {
  let lastErr: unknown;
  let currentReq = req;
  const attempts = Math.max(1, maxAttempts);
  for (let i = 1; i <= attempts; i++) {
    try {
      return await callAdapter(adapter, currentReq, role, log, userId);
    } catch (err) {
      lastErr = err;
      currentReq = withHumanizeRetry(currentReq, err);
      const retryable = shouldRetrySameProvider(err) || /ai_generated_voice/.test(err instanceof Error ? err.message : '');
      if (!retryable || i >= attempts) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function formatAllProvidersFailed(errors: string[]): string {
  const joined = errors.join(' | ');
  if (/quota exceeded|rate.?limit|free_tier|429/i.test(joined)) {
    return `All AI providers exhausted or rate-limited — ${joined}.`;
  }
  return `All AI providers failed. ${joined}`;
}

function splitProviderChain(chain: string[]): { geminiChain: string[]; tailChain: string[] } {
  const geminiChain = chain.filter((name) => name === 'gemini' || name === 'gemini_fallback');
  const tailChain = chain.filter((name) => name !== 'gemini' && name !== 'gemini_fallback');
  return { geminiChain, tailChain };
}

/**
 * Provider chain: paid GEMINI_API_KEY_FALLBACK only.
 */
export async function generateWithProviders(
  req: Omit<GenerateRequest, 'timeoutMs'> & { timeoutMs?: number },
  deps: GenerateDeps = {},
): Promise<GenerateResult> {
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
      provider: 'gemini_fallback',
      message: 'No AI provider is configured (set GEMINI_API_KEY_FALLBACK)',
      retryable: false,
      kind: 'missing_key',
    });
  }

  const { geminiChain, tailChain } = splitProviderChain(chain);

  // A non-retryable failure (e.g. HTTP 400) means the request itself is bad — retrying it
  // on another provider only burns quota, so stop the chain instead of cascading.
  let requestIsUnservable = false;

  for (let index = 0; index < geminiChain.length; index++) {
    const providerName = geminiChain[index];
    const adapter = adapters[providerName];
    if (!adapter?.isConfigured()) {
      log(`[AI] provider=${providerLabel(providerName)} skipped kind=missing_key`);
      continue;
    }

    const role = index === 0 ? 'primary' : 'fallback';
    const attempts = deps.maxAttempts ?? maxAttemptsForProvider(providerName);

    const providerTimeout = timeoutForProvider(providerName, request.operation, timeoutMs);

    try {
      return await tryProvider(adapter, { ...request, timeoutMs: providerTimeout }, role, attempts, log, deps.userId);
    } catch (err) {
      const message = err instanceof Error ? sanitizeAiErrorMessage(err.message) : String(err);
      errors.push(`${providerLabel(providerName)}: ${message}`);
      if (!shouldFallback(err)) {
        requestIsUnservable = true;
        break;
      }
      const hasNext = geminiChain.slice(index + 1).some((name) => adapters[name]?.isConfigured());
      if (!hasNext) break;
    }
  }

  for (let index = 0; index < tailChain.length && !requestIsUnservable; index++) {
    const providerName = tailChain[index];
    const adapter = adapters[providerName];
    if (!adapter?.isConfigured()) {
      log(`[AI] provider=${providerLabel(providerName)} skipped kind=missing_key`);
      continue;
    }

    const providerTimeout = timeoutForProvider(providerName, request.operation, timeoutMs);

    try {
      return await tryProvider(adapter, { ...request, timeoutMs: providerTimeout }, 'fallback', 1, log, deps.userId);
    } catch (err) {
      const message = err instanceof Error ? sanitizeAiErrorMessage(err.message) : String(err);
      errors.push(`${providerLabel(providerName)}: ${message}`);
      const hasNext = tailChain.slice(index + 1).some((name) => adapters[name]?.isConfigured());
      if (!shouldFallback(err) || !hasNext) break;
    }
  }

  throw new Error(
    errors.length
      ? formatAllProvidersFailed(errors)
      : 'No AI provider is configured (set GEMINI_API_KEY_FALLBACK)',
  );
}

export async function generateText(
  req: Omit<GenerateRequest, 'timeoutMs'> & { timeoutMs?: number },
  deps: GenerateDeps = {},
): Promise<string> {
  const result = await generateWithProviders(req, deps);
  return result.text;
}

export function providerNames(): { chain: string[] } {
  return { chain: getProviderChain() };
}
