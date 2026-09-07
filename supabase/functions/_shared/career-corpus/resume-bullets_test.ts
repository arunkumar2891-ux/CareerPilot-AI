import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildBulletCatalog,
  formatRetrievedEvidenceBlock,
  matchEvidenceToCatalog,
  scoreRetrievalCandidates,
} from './resume-bullets.ts';
import { parseRerankIds } from './rerank-bullets.ts';
import { retrievalTerms } from './prompt.ts';

const SAMPLE_MASTER = `ARUN KUMAR
Integration Architect
Email: arun@example.com

================================================================================
PROFESSIONAL SUMMARY
================================================================================

Built scalable integration platforms.

--- Project: CareerPilot AI ---
- Shipped Gemini-powered resume tailoring with hybrid retrieval.
- Built 18-node workflow pipeline on Supabase.

--- Project: Pic-Reel ---
- Delivered browser-side FFmpeg hyperlapse tool.`;

Deno.test('buildBulletCatalog assigns stable IDs and normalizes bullets', () => {
  const catalog = buildBulletCatalog(SAMPLE_MASTER);
  assertEquals(catalog.some((line) => line.id === 'B001'), true);
  assertEquals(catalog.some((line) => line.text.includes('Gemini-powered')), true);
  assertEquals(catalog.find((line) => line.text.includes('Gemini-powered'))?.isBullet, true);
});

Deno.test('scoreRetrievalCandidates boosts role bank and evidence sources', () => {
  const catalog = buildBulletCatalog(SAMPLE_MASTER);
  const evidence = [{ id: 'e1', tags: ['gemini'], text: 'Shipped Gemini-powered resume tailoring with hybrid retrieval.' }];
  const scored = scoreRetrievalCandidates({
    catalog,
    roleBankText: '- Shipped Gemini-powered resume tailoring with hybrid retrieval.',
    lexicalMatches: '--- Project: CareerPilot AI ---',
    evidenceChunks: evidence,
    jobDescription: 'GenAI developer with Gemini experience',
    retrievalTerms: retrievalTerms('GenAI developer with Gemini experience'),
  });
  const top = scored[0];
  assertEquals(top.sources.includes('role_bank') || top.sources.includes('evidence'), true);
});

Deno.test('matchEvidenceToCatalog links evidence to catalog IDs', () => {
  const catalog = buildBulletCatalog(SAMPLE_MASTER);
  const matches = matchEvidenceToCatalog(
    [{ id: 'e1', tags: ['gemini'], text: 'Shipped Gemini-powered resume tailoring with hybrid retrieval.' }],
    catalog,
  );
  assertEquals(matches[0].catalogId != null, true);
  assertEquals(formatRetrievedEvidenceBlock(matches).includes('RETRIEVED EVIDENCE'), true);
});

Deno.test('parseRerankIds accepts JSON arrays of ids', () => {
  const ids = parseRerankIds('["B003","B001","B003","B999"]', ['B001', 'B003', 'B004']);
  assertEquals(ids, ['B003', 'B001']);
});
