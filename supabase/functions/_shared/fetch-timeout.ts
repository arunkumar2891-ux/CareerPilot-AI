export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function bodySnippet(text: string): string {
  return text.slice(0, 200).replace(/\s+/g, ' ').trim();
}

/**
 * Fetch + JSON.parse with guards. External APIs (Apify, etc.) can return HTML
 * error pages from Cloudflare/load balancers during transient outages — calling
 * res.json() on those throws a cryptic "Unexpected token '<'" parse error.
 * This throws a descriptive error with the HTTP status instead.
 */
export async function fetchJsonChecked<T = unknown>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs, label);
  const text = await res.text();
  if (!res.ok) {
    const isHtml = /^\s*</.test(text);
    throw new Error(
      isHtml
        ? `${label} failed: HTTP ${res.status} — service returned an HTML error page (transient outage or rate limit)`
        : `${label} failed: HTTP ${res.status} — ${bodySnippet(text) || 'empty response'}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `${label} returned invalid JSON (HTTP ${res.status}): ${bodySnippet(text) || 'empty response'}`,
    );
  }
}
