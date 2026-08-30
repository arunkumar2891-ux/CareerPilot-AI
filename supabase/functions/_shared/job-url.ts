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

/** LinkedIn f_TPR: seconds since posted (r + seconds). */
const POSTED_WITHIN_TO_F_TPR: Record<string, string> = {
  '1d': 'r86400',
  '24h': 'r86400',
  '86400': 'r86400',
  '3d': 'r259200',
  '7d': 'r604800',
  '30d': 'r2592000',
  'any': '',
};

const POSTED_WITHIN_TO_SECONDS: Record<string, number | null> = {
  '1d': 86400,
  '24h': 86400,
  '86400': 86400,
  '3d': 259200,
  '7d': 604800,
  '30d': 2592000,
  'any': null,
};

export const DEFAULT_JOB_POSTED_WITHIN = '1d';

function normalizePostedWithin(postedWithin?: string): string {
  const key = String(postedWithin || DEFAULT_JOB_POSTED_WITHIN).trim().toLowerCase();
  if (key in POSTED_WITHIN_TO_F_TPR) return key;
  return DEFAULT_JOB_POSTED_WITHIN;
}

export function linkedInPostedWithinFilter(postedWithin?: string): string | undefined {
  const fTPR = POSTED_WITHIN_TO_F_TPR[normalizePostedWithin(postedWithin)];
  return fTPR || undefined;
}

/** Cutoff date for parse-time filtering; null = no date filter. */
export function postedWithinCutoffIso(postedWithin?: string): string | null {
  const seconds = POSTED_WITHIN_TO_SECONDS[normalizePostedWithin(postedWithin)];
  if (seconds == null) return null;
  return new Date(Date.now() - seconds * 1000).toISOString().slice(0, 10);
}

/** LinkedIn search with no work-type filter — on-site, remote, and hybrid. */
export function buildLinkedInJobSearchUrl(
  query: string,
  location: string,
  postedWithin?: string,
): string {
  const params = new URLSearchParams({
    keywords: query.trim() || 'Software Engineer',
    location: location.trim() || 'United States',
    sortBy: 'DD',
  });
  const fTPR = linkedInPostedWithinFilter(postedWithin);
  if (fTPR) params.set('f_TPR', fTPR);
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export function inferJobWorkplace(
  location: string,
  employmentType = '',
  workplaceType = '',
): { remote: boolean; hybrid: boolean } {
  const text = [location, employmentType, workplaceType].join(' ').toLowerCase();
  const remote = /\bremote\b|remoto|work from home|\bwfh\b/.test(text);
  const hybrid = /\bhybrid\b|híbrido|partially remote/.test(text);
  return { remote, hybrid };
}
