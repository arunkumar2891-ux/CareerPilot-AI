import { generateText } from '../ai/router.ts';
import { loadMasterResumeText } from './load.ts';
import {
  lexicalMatchScore,
  parseMatchScoreResponse,
  parseMatchScoresResponse,
} from './score-parse.ts';

export {
  clampMatchScore,
  lexicalMatchScore,
  parseMatchScoreResponse,
  parseMatchScoresResponse,
  tokenizeScoreText,
} from './score-parse.ts';

export interface JobMatchScore {
  score: number;
  source: string;
  method: 'model' | 'lexical';
}

export { loadMasterResumeText };

export async function scoreJobMatch(input: {
  jobDescription: string;
  jobTitle?: string;
  company?: string;
  resumeText: string;
  resumeName?: string;
  userId?: string;
}): Promise<JobMatchScore> {
  const results = await scoreJobsAgainstResume({
    jobs: [{
      jobDescription: input.jobDescription,
      jobTitle: input.jobTitle,
      company: input.company,
    }],
    resumeText: input.resumeText,
    resumeName: input.resumeName,
    userId: input.userId,
  });
  return results[0] || { score: 0, source: String(input.resumeName || 'Resume'), method: 'lexical' };
}

export async function scoreJobsAgainstResume(input: {
  jobs: Array<{ jobDescription?: string; description?: string; jobTitle?: string; title?: string; company?: string }>;
  resumeText: string;
  resumeName?: string;
  userId?: string;
}): Promise<JobMatchScore[]> {
  const source = String(input.resumeName || 'Resume').trim() || 'Resume';
  const resumeText = String(input.resumeText || '').trim();
  const lexical = input.jobs.map((job) => ({
    score: lexicalMatchScore(String(job.jobDescription || job.description || ''), resumeText),
    source,
    method: 'lexical' as const,
  }));
  if (!resumeText || input.jobs.length === 0) return lexical;

  try {
    const listed = input.jobs.map((job, index) => {
      const title = String(job.jobTitle || job.title || 'Unknown');
      const company = String(job.company || 'Unknown');
      const description = String(job.jobDescription || job.description || '').slice(0, 1800);
      return `${index + 1}. ${title} @ ${company}\n${description}`;
    }).join('\n\n---\n\n');
    const raw = await generateText({
      operation: 'ats_score',
      systemPrompt: 'Return valid JSON only. No markdown.',
      userPrompt: [
        `Score how well this resume matches each job on a 0-100 scale.`,
        `Return JSON only: {"scores": [${input.jobs.map(() => '0').join(', ')}]}.`,
        `There are exactly ${input.jobs.length} jobs. The scores array must have ${input.jobs.length} integers.`,
        `Resume:\n${resumeText.slice(0, 8000)}`,
        `Jobs:\n${listed}`,
      ].join('\n\n'),
    }, { userId: input.userId });
    const parsed = parseMatchScoresResponse(raw, input.jobs.length)
      ?? (input.jobs.length === 1 ? [parseMatchScoreResponse(raw) ?? -1] : null);
    if (parsed && parsed.length === input.jobs.length && parsed.every((n) => n >= 0)) {
      return parsed.map((score) => ({ score, source, method: 'model' as const }));
    }
  } catch {
    /* lexical fallback */
  }
  return lexical;
}
