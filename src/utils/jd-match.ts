const STOP = new Set([
  'and', 'the', 'for', 'with', 'you', 'your', 'this', 'that', 'from', 'have',
  'will', 'are', 'our', 'job', 'role', 'team', 'work', 'plus', 'etc',
  'who', 'what', 'when', 'where', 'why', 'how', 'can', 'may', 'must',
  'able', 'also', 'into', 'such', 'than', 'then', 'them', 'they', 'their',
  'there', 'these', 'those', 'been', 'being', 'both', 'each', 'more', 'most',
  'other', 'some', 'any', 'all', 'not', 'but', 'out', 'over', 'after',
  'before', 'about', 'across', 'through', 'between', 'under', 'again',
  'once', 'only', 'very', 'just', 'like', 'make', 'made', 'using', 'used',
  'use', 'well', 'good', 'best', 'high', 'new', 'including', 'includes',
  'include', 'within', 'across', 'among', 'while', 'during', 'without',
  'join', 'play', 'key', 'part', 'perks', 'benefits', 'culture', 'life',
  'us', 'we', 'our', 'youll', 'youre', 'weve', 'were', 'dont', 'does',
  'doing', 'done', 'get', 'got', 'has', 'had', 'having', 'its', 'own',
  'one', 'two', 'year', 'years', 'day', 'days', 'time', 'times',
  'strong', 'great', 'excellent', 'preferred', 'required', 'requirements',
  'responsibility', 'responsibilities', 'looking', 'opportunity',
  'opportunities', 'environment', 'company', 'position', 'candidate',
  'candidates', 'please', 'apply', 'application', 'description',
  'about', 'why', 'what', 'who', 'how',
]);

const SHORT_TECH = new Set([
  'ai', 'ml', 'aws', 'gcp', 'sql', 'api', 'rag', 'nlp', 'ci', 'cd',
  'c++', 'c#', 'js', 'ts', 'go', 'k8s', 'eks', 's3', 'ec2',
]);

export function tokenizeScoreText(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.trim())
    .filter((w) => {
      if (!w) return false;
      if (STOP.has(w)) return false;
      if (SHORT_TECH.has(w)) return true;
      return w.length >= 4;
    });
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
