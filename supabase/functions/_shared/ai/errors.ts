import { ProviderError, type AiProviderName } from './types.ts';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function sanitizeAiErrorMessage(message: string): string {
  return message
    .replace(/key=[^&\s]+/gi, 'key=REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED')
    .replace(/AIza[A-Za-z0-9_-]+/g, 'REDACTED')
    .replace(/gsk_[A-Za-z0-9]+/g, 'REDACTED');
}

export function classifyProviderFailure(
  provider: AiProviderName,
  err: unknown,
  status?: number,
): ProviderError {
  if (err instanceof ProviderError) return err;

  const raw = err instanceof Error ? err.message : String(err);
  const message = sanitizeAiErrorMessage(raw);
  const name = err instanceof Error ? err.name : '';

  if (name === 'AbortError' || /timed out/i.test(message)) {
    return new ProviderError({
      provider,
      message,
      retryable: true,
      kind: 'timeout',
      status,
    });
  }

  if (status && RETRYABLE_STATUS.has(status)) {
    return new ProviderError({
      provider,
      message,
      retryable: true,
      kind: `http_${status}`,
      status,
    });
  }

  if (/failed to fetch|network|econnreset|socket/i.test(message)) {
    return new ProviderError({
      provider,
      message,
      retryable: true,
      kind: 'network',
      status,
    });
  }

  if (/not configured|api_key|api key/i.test(message)) {
    return new ProviderError({
      provider,
      message,
      retryable: false,
      kind: 'missing_key',
      status: status ?? 401,
    });
  }

  if (status && status >= 400 && status < 500) {
    return new ProviderError({
      provider,
      message,
      retryable: false,
      kind: `http_${status}`,
      status,
    });
  }

  return new ProviderError({
    provider,
    message,
    retryable: false,
    kind: 'unknown',
    status,
  });
}

export function isMissingKeyError(err: unknown): boolean {
  return err instanceof ProviderError && err.kind === 'missing_key';
}

export function shouldFallback(err: unknown): boolean {
  if (isMissingKeyError(err)) return true;
  return err instanceof ProviderError && err.retryable;
}
