import { generateText } from '../ai/router.ts';
import type { ScoredBullet } from './resume-bullets.ts';

const RERANK_SYSTEM_PROMPT = `You rerank resume bullet IDs for a target job description.
Return ONLY a JSON array of bullet ID strings in priority order (highest relevance first).
Use only IDs from the candidate list. Include 12-24 IDs when enough strong matches exist.
Never select ATS keyword reference lines (e.g. lines containing "Keywords:").
Do not include explanations, markdown, or any text outside the JSON array.`;

export function parseRerankIds(raw: string, allowedIds: string[]): string[] {
  const allowed = new Set(allowedIds);
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];
    parsed = JSON.parse(match[0]);
  }

  const ids: string[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'string' && allowed.has(item)) ids.push(item);
      if (item && typeof item === 'object' && typeof (item as { id?: string }).id === 'string') {
        const id = (item as { id: string }).id;
        if (allowed.has(id)) ids.push(id);
      }
    }
  }

  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildRerankUserPrompt(
  candidates: ScoredBullet[],
  context: {
    jobTitle?: string;
    company?: string;
    playbookTitle?: string;
    jobDescription: string;
  },
): string {
  const candidateBlock = candidates.map((c) => (
    `${c.id} (score=${c.score}, sources=${c.sources.join('+')}): ${c.isBullet ? `- ${c.text}` : c.text}`
  )).join('\n');

  return [
    `TARGET: ${context.jobTitle || '(unknown)'} at ${context.company || '(unknown)'}`,
    `PLAYBOOK: ${context.playbookTitle || 'none'}`,
    `JOB DESCRIPTION:\n${context.jobDescription.slice(0, 6000)}`,
    `CANDIDATE BULLETS:\n${candidateBlock}`,
  ].join('\n\n');
}

export async function rerankBulletsWithLlm(
  candidates: ScoredBullet[],
  context: {
    jobTitle?: string;
    company?: string;
    playbookTitle?: string;
    jobDescription: string;
  },
  userId?: string,
  limit = 24,
): Promise<string[]> {
  const pool = candidates.slice(0, 50);
  if (!pool.length) return [];
  if (pool.length <= limit) return pool.map((c) => c.id);

  try {
    const raw = await generateText({
      systemPrompt: RERANK_SYSTEM_PROMPT,
      userPrompt: buildRerankUserPrompt(pool, context),
      operation: 'resume_rerank',
      timeoutMs: 25000,
    }, { userId });

    const reranked = parseRerankIds(raw, pool.map((c) => c.id));
    if (reranked.length >= 8) return reranked.slice(0, limit);

    const fallback = pool.slice(0, limit).map((c) => c.id);
    for (const id of reranked) {
      if (!fallback.includes(id)) fallback.push(id);
    }
    return fallback.slice(0, limit);
  } catch {
    return pool.slice(0, limit).map((c) => c.id);
  }
}
