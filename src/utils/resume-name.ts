export function shortJobKey(jobId: string): string {
  return jobId.replace(/-/g, '').slice(0, 8);
}

export function parseTailoredJobKey(name: string): string | null {
  const match = name.trim().match(/\(([0-9a-f]{8})\)\s*$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/** `Tailored: Company Role (jobKey)` — job key keeps two postings of the same role distinct. */
export function buildTailoredResumeName(company: string, role: string, jobId?: string): string {
  const suffix = jobId ? ` (${shortJobKey(jobId)})` : '';
  const prefix = 'Tailored: ';
  const maxBase = Math.max(8, 120 - prefix.length - suffix.length);
  const base = `${company} ${role}`.replace(/\s+/g, ' ').trim().slice(0, maxBase).trim();
  return `${prefix}${base}${suffix}`;
}
