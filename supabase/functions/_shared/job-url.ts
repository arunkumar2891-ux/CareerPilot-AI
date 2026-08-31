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

const QUERY_ALIASES: Record<string, string> = {
  fde: 'Forward Deployed Engineer',
  fd: 'Forward Deployed Engineer',
  'forward deployment engineer': 'Forward Deployed Engineer',
  'forward deployed engineer': 'Forward Deployed Engineer',
  genai: 'Generative AI Engineer',
  swe: 'Software Engineer',
  sde: 'Software Development Engineer',
  pm: 'Product Manager',
  em: 'Engineering Manager',
};

/** Expand short role aliases (e.g. FDE) before searching LinkedIn. */
export function expandJobSearchQuery(query: string): string {
  const trimmed = String(query || '').trim();
  if (!trimmed) return 'Software Engineer';
  const aliasKey = trimmed.toLowerCase();
  if (QUERY_ALIASES[aliasKey]) return QUERY_ALIASES[aliasKey];
  return trimmed;
}

export function extractSearchTerms(query: string): string[] {
  const expanded = expandJobSearchQuery(query);
  return expanded
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
    .filter((w) => !['and', 'the', 'for', 'with'].includes(w));
}

/** Post-filter scraped jobs so location-only LinkedIn results do not pollute the pipeline. */
export function jobMatchesSearchQuery(title: string, description: string, query: string): boolean {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return true;

  const expanded = expandJobSearchQuery(query).toLowerCase().trim();
  const hay = `${title} ${description}`.toLowerCase();
  const titleLower = title.toLowerCase();

  if (expanded.length >= 10 && hay.includes(expanded)) return true;

  const titleHits = terms.filter((t) => titleLower.includes(t)).length;
  const totalHits = terms.filter((t) => hay.includes(t)).length;

  if (terms.length === 1) return titleHits >= 1 || totalHits >= 1;
  if (terms.length === 2) return titleHits >= 1 || totalHits >= 2;
  return titleHits >= 2 || totalHits >= Math.ceil(terms.length * 0.67);
}

const POSTED_WITHIN_TO_APIFY: Record<string, string> = {
  '1d': 'past24Hours',
  '24h': 'past24Hours',
  '86400': 'past24Hours',
  '3d': 'pastWeek',
  '7d': 'pastWeek',
  '30d': 'pastMonth',
  'any': 'anyTime',
};

export function postedWithinToApifyDatePosted(postedWithin?: string): string {
  const key = normalizePostedWithin(postedWithin);
  return POSTED_WITHIN_TO_APIFY[key] || 'past24Hours';
}

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

/** LinkedIn search URL for reference / manual verification (no deprecated sort filters). */
export function buildLinkedInJobSearchUrl(
  query: string,
  location: string,
  postedWithin?: string,
): string {
  const params = new URLSearchParams({
    keywords: expandJobSearchQuery(query),
    location: location.trim() || 'United States',
  });
  const fTPR = linkedInPostedWithinFilter(postedWithin);
  if (fTPR) params.set('f_TPR', fTPR);
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export function buildApifyJobSearchInput(
  query: string,
  location: string,
  postedWithin?: string,
  limitPerSource?: number,
): {
  keywords: string;
  location: string;
  datePosted: string;
  linkedinUrl: string;
  limitPerSource?: number;
} {
  const keywords = expandJobSearchQuery(query);
  const loc = location.trim() || 'United States';
  return {
    keywords,
    location: loc,
    datePosted: postedWithinToApifyDatePosted(postedWithin),
    linkedinUrl: buildLinkedInJobSearchUrl(keywords, loc, postedWithin),
    limitPerSource: limitPerSource && limitPerSource > 0 ? limitPerSource : undefined,
  };
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
