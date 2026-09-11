import { clampMatchScore, lexicalMatchScore, parseMatchScoreResponse, parseMatchScoresResponse } from './score-parse.ts';

Deno.test('parseMatchScoreResponse reads JSON score', () => {
  const score = parseMatchScoreResponse('```json\n{"score": 82}\n```');
  if (score !== 82) throw new Error(String(score));
});

Deno.test('parseMatchScoreResponse clamps out-of-range values', () => {
  if (parseMatchScoreResponse('{"score": 140}') !== 100) throw new Error('cap');
  if (parseMatchScoreResponse('{"score": -4}') !== 0) throw new Error('floor');
});

Deno.test('lexicalMatchScore rewards overlapping skills from the JD', () => {
  const score = lexicalMatchScore(
    'Looking for a Forward Deployed Engineer with Kubernetes, Python, and customer delivery.',
    'Forward Deployed Engineer. Built Kubernetes platforms in Python for enterprise customers.',
  );
  if (score < 40) throw new Error(`expected a meaningful overlap, got ${score}`);
});

Deno.test('lexicalMatchScore is 0 when the resume is empty', () => {
  if (lexicalMatchScore('Kubernetes Python', '') !== 0) throw new Error('empty resume');
});

Deno.test('clampMatchScore rounds', () => {
  if (clampMatchScore(81.6) !== 82) throw new Error(String(clampMatchScore(81.6)));
});

Deno.test('parseMatchScoresResponse reads a scores array in order', () => {
  const scores = parseMatchScoresResponse('{"scores": [91, 44, 0]}', 3);
  if (!scores || scores.join(',') !== '91,44,0') throw new Error(String(scores));
});

Deno.test('parseMatchScoresResponse rejects the wrong length', () => {
  if (parseMatchScoresResponse('{"scores": [10, 20]}', 3) !== null) {
    throw new Error('length mismatch must fall back');
  }
});
