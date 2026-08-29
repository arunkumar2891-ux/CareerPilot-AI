/** Canonical LinkedIn job URL for dedupe + storage (strip tracking params, normalize host). */
export function normalizeLinkedInJobUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes('linkedin.com')) {
      u.hostname = 'www.linkedin.com';
    }
    const idMatch = u.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?$/i);
    if (idMatch) {
      return `https://www.linkedin.com/jobs/view/${idMatch[1]}`;
    }
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return trimmed.split('?')[0].split('#')[0];
  }
}

export function flattenJobItems(input: unknown): Record<string, unknown>[] {
  const flat: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    if (row.skipped) return;
    if (row.jobLink || row.link || row.url || row.jobUrl) {
      flat.push(row);
    }
  };
  walk(input);
  return flat;
}
