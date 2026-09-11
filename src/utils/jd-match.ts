const STOP = new Set([
  'and', 'the', 'for', 'with', 'you', 'your', 'this', 'that', 'from', 'have',
  'will', 'are', 'our', 'job', 'role', 'team', 'work', 'plus', 'etc',
]);

export function tokenizeScoreText(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

export interface JdMatchResult {
  score: number;
  matched: string[];
  missed: string[];
  totalTerms: number;
}

export function lexicalMatchScore(jd: string, resume: string): JdMatchResult {
  const jobTerms = [...new Set(tokenizeScoreText(jd))];
  if (!jobTerms.length) return { score: 0, matched: [], missed: [], totalTerms: 0 };
  const resumeTerms = new Set(tokenizeScoreText(resume));
  const matched: string[] = [];
  const missed: string[] = [];
  for (const term of jobTerms) {
    if (resumeTerms.has(term)) {
      matched.push(term);
    } else {
      missed.push(term);
    }
  }
  return {
    score: Math.round((matched.length / jobTerms.length) * 100),
    matched,
    missed,
    totalTerms: jobTerms.length,
  };
}

export function highlightTerms(text: string, terms: string[]): { text: string; isMatch: boolean }[] {
  if (!terms.length) return [{ text, isMatch: false }];
  const termSet = new Set(terms.map((t) => t.toLowerCase()));
  const segments: { text: string; isMatch: boolean }[] = [];
  const words = text.split(/(\s+)/);
  for (const word of words) {
    const clean = word.toLowerCase().replace(/[^a-z0-9+#.]/g, '');
    if (clean && termSet.has(clean)) {
      segments.push({ text: word, isMatch: true });
    } else {
      segments.push({ text: word, isMatch: false });
    }
  }
  return segments;
}
