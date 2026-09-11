const STOP = new Set([
  'and', 'the', 'for', 'with', 'you', 'your', 'this', 'that', 'from', 'have',
  'will', 'are', 'our', 'job', 'role', 'team', 'work', 'plus', 'etc',
]);

export function clampMatchScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function tokenizeScoreText(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

export function lexicalMatchScore(jobDescription: string, resume: string): number {
  const jobTerms = [...new Set(tokenizeScoreText(jobDescription))];
  if (!jobTerms.length) return 0;
  const resumeTerms = new Set(tokenizeScoreText(resume));
  let hit = 0;
  for (const term of jobTerms) {
    if (resumeTerms.has(term)) hit++;
  }
  return clampMatchScore((hit / jobTerms.length) * 100);
}

export function parseMatchScoreResponse(text: string): number | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0].replace(/```json\n?|\n?```/g, '')) as Record<string, unknown>;
      const n = Number(parsed.score ?? parsed.matchScore);
      if (Number.isFinite(n)) return clampMatchScore(n);
    } catch {
      /* fall through */
    }
  }
  const n = Number(trimmed.match(/\b(\d{1,3})\b/)?.[1]);
  if (!Number.isFinite(n)) return null;
  return clampMatchScore(n);
}

export function parseMatchScoresResponse(text: string, count: number): number[] | null {
  if (count < 1) return [];
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/) || trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0].replace(/```json\n?|\n?```/g, '')) as unknown;
    const values = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { scores?: unknown }).scores)
        ? (parsed as { scores: unknown[] }).scores
        : null;
    if (!values || values.length !== count) return null;
    return values.map((value) => clampMatchScore(Number(value)));
  } catch {
    return null;
  }
}
