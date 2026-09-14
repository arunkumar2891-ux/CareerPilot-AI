import { isDuplicateSkipOutput } from '../job-dedupe.ts';
import {
  BELOW_MATCH_SCORE_REASON,
  DEFAULT_MIN_MATCH_SCORE,
  belowMatchScoreSkip,
  belowThresholdEmailSection,
  isBelowMatchScoreSkip,
  matchScoreLogMessages,
  minMatchScore,
  passesMatchGate,
} from './match-gate.ts';

Deno.test('minMatchScore defaults to 80 and tolerates junk', () => {
  if (minMatchScore(undefined) !== 80) throw new Error('missing settings should default to 80');
  if (minMatchScore({}) !== 80) throw new Error('absent key should default to 80');
  if (minMatchScore({ minMatchScore: '' }) !== 80) throw new Error('empty string should default');
  if (minMatchScore({ minMatchScore: 'abc' }) !== 80) throw new Error('non-numeric should default');
  if (minMatchScore({ minMatchScore: -5 }) !== 80) throw new Error('negative should default');
  if (DEFAULT_MIN_MATCH_SCORE !== 80) throw new Error('documented default drifted');
});

Deno.test('minMatchScore honours a configured value and clamps unbeatable ones', () => {
  if (minMatchScore({ minMatchScore: '65' }) !== 65) throw new Error('string 65');
  if (minMatchScore({ minMatchScore: 90 }) !== 90) throw new Error('number 90');
  if (minMatchScore({ minMatchScore: 82.7 }) !== 82) throw new Error('should floor');
  if (minMatchScore({ minMatchScore: 0 }) !== 0) throw new Error('0 means let everything through');
  // 100 with a strictly-greater gate would skip every job forever.
  if (minMatchScore({ minMatchScore: 100 }) !== 99) throw new Error('100 must clamp to 99');
  if (minMatchScore({ minMatchScore: 1000 }) !== 99) throw new Error('over-100 must clamp to 99');
});

Deno.test('passesMatchGate is strictly greater than the threshold', () => {
  if (!passesMatchGate(81, 80)) throw new Error('81 must pass an 80 threshold');
  if (passesMatchGate(80, 80)) throw new Error('exactly 80 must NOT pass (user chose score > 80)');
  if (passesMatchGate(79, 80)) throw new Error('79 must not pass');
  if (passesMatchGate(0, 0)) throw new Error('0 must not pass a 0 threshold');
  if (!passesMatchGate(1, 0)) throw new Error('1 must pass a 0 threshold');
  if (passesMatchGate(Number.NaN, 80)) throw new Error('NaN must not pass');
});

Deno.test('belowMatchScoreSkip keeps the job payload for the email and checkpoint', () => {
  const skip = belowMatchScoreSkip(
    { company: 'Exterro', title: 'ML Engineer', jobLink: 'https://x/1', jobId: 'job-1' },
    62,
    80,
  );
  if (skip.company !== 'Exterro') throw new Error('company must survive so the email can list it');
  if (skip.jobLink !== 'https://x/1') throw new Error('job link must survive');
  if (skip.jobId !== 'job-1') throw new Error('jobId must survive so completeJobExecution links it');
  if (skip.matchScore !== 62) throw new Error('score must be carried');
  if (skip.matchThreshold !== 80) throw new Error('threshold must be carried');
  if (skip.reason !== BELOW_MATCH_SCORE_REASON) throw new Error('reason tag wrong');
});

Deno.test('match-gate skips are distinct from duplicate skips', () => {
  const gate = belowMatchScoreSkip({ company: 'Acme' }, 10, 80);
  if (!isBelowMatchScoreSkip(gate)) throw new Error('gate skip must be recognised');
  // Critical: the duplicate path completes the job as "skipped (duplicate)" and
  // must not claim match-gate skips.
  if (isDuplicateSkipOutput(gate)) throw new Error('match-gate skip must not look like a duplicate');

  const dupe = { skipped: true, reason: 'duplicate', jobId: 'j1' };
  if (isBelowMatchScoreSkip(dupe)) throw new Error('duplicate must not look like a match-gate skip');

  if (isBelowMatchScoreSkip({ company: 'Acme', matchScore: 91 })) {
    throw new Error('a passing job must not be treated as skipped');
  }
  if (isBelowMatchScoreSkip(null) || isBelowMatchScoreSkip([{ skipped: true, reason: BELOW_MATCH_SCORE_REASON }])) {
    throw new Error('null and arrays must not match');
  }
});

Deno.test('matchScoreLogMessages names the company and the score', () => {
  const [message] = matchScoreLogMessages({
    company: 'Exterro India',
    title: 'Machine Learning Engineer',
    matchScore: 91,
    matchScoreSource: 'Master Resume',
    matchThreshold: 80,
  });
  if (!message.includes('Exterro India')) throw new Error(`company missing: ${message}`);
  if (!message.includes('Machine Learning Engineer')) throw new Error(`role missing: ${message}`);
  if (!message.includes('91%')) throw new Error(`score missing: ${message}`);
  if (!message.includes('Master Resume')) throw new Error(`resume source missing: ${message}`);
  if (!/ATS Optimizer/i.test(message)) throw new Error(`should say it continues: ${message}`);
});

Deno.test('matchScoreLogMessages explains a skip and mentions Discovered', () => {
  const [message] = matchScoreLogMessages(
    belowMatchScoreSkip(
      { company: 'Acme Corp', title: 'Data Scientist', matchScoreSource: 'Master Resume' },
      54,
      80,
    ),
  );
  if (!message.includes('Acme Corp')) throw new Error(`company missing: ${message}`);
  if (!message.includes('54%')) throw new Error(`score missing: ${message}`);
  if (!message.includes('80%')) throw new Error(`threshold missing: ${message}`);
  if (!/Discovered/.test(message)) throw new Error(`should explain where the job lands: ${message}`);
});

Deno.test('matchScoreLogMessages falls back when company or role is blank', () => {
  const [companyOnly] = matchScoreLogMessages({ company: 'Acme', matchScore: 70 });
  if (!companyOnly.startsWith('Acme —')) throw new Error(companyOnly);

  const [roleOnly] = matchScoreLogMessages({ title: 'SRE', matchScore: 70 });
  if (!roleOnly.startsWith('SRE —')) throw new Error(roleOnly);

  const [neither] = matchScoreLogMessages({ matchScore: 70 });
  if (!neither.startsWith('Unknown company')) throw new Error(neither);
});

Deno.test('matchScoreLogMessages emits one line per job for array input and ignores unscored', () => {
  const messages = matchScoreLogMessages([
    { company: 'A', matchScore: 90 },
    { company: 'B', matchScore: 20 },
    { company: 'C' },
    null,
  ]);
  if (messages.length !== 2) throw new Error(`expected 2 lines, got ${messages.length}`);
  if (!messages[0].includes('A') || !messages[1].includes('B')) throw new Error(messages.join(' | '));
});

Deno.test('a zero score still logs (0 must not be dropped as falsy)', () => {
  const messages = matchScoreLogMessages({ company: 'Zed', matchScore: 0 });
  if (messages.length !== 1) throw new Error('score 0 is a real score and must be logged');
  if (!messages[0].includes('0%')) throw new Error(messages[0]);
});

Deno.test('belowThresholdEmailSection is empty when nothing was skipped', () => {
  if (belowThresholdEmailSection([]) !== '') throw new Error('empty list must yield no section');
  if (belowThresholdEmailSection(undefined) !== '') throw new Error('undefined must yield no section');
  if (belowThresholdEmailSection(null) !== '') throw new Error('null must yield no section');
});

Deno.test('belowThresholdEmailSection lists every skipped job with its score', () => {
  const html = belowThresholdEmailSection([
    { company: 'Acme', roleName: 'SRE', matchScore: 54, jobLink: 'https://x/1', matchThreshold: 80 },
    { company: 'Globex', roleName: 'MLE', matchScore: 71, jobLink: 'https://x/2', matchThreshold: 80 },
  ]);
  for (const needle of ['Acme', 'SRE', '54%', 'Globex', 'MLE', '71%', 'https://x/1', 'https://x/2']) {
    if (!html.includes(needle)) throw new Error(`missing ${needle} in:\n${html}`);
  }
  if (!html.includes('80% match threshold')) throw new Error('should state the threshold');
  if (!/Discovered/.test(html)) throw new Error('should tell the user where the jobs are');
  // Highest score first: those are the closest to being worth a manual run.
  if (html.indexOf('Globex') > html.indexOf('Acme')) {
    throw new Error('skipped jobs should be sorted by score, highest first');
  }
});

Deno.test('belowThresholdEmailSection escapes scraped company names', () => {
  const html = belowThresholdEmailSection([
    { company: '<script>alert(1)</script>', roleName: 'A & B "quoted"', matchScore: 10 },
  ]);
  if (html.includes('<script>')) throw new Error(`raw script tag reached the email:\n${html}`);
  if (!html.includes('&lt;script&gt;')) throw new Error('company should be escaped');
  if (!html.includes('&amp;')) throw new Error('ampersand should be escaped');
});

Deno.test('belowThresholdEmailSection drops non-http job links', () => {
  const html = belowThresholdEmailSection([
    { company: 'Acme', matchScore: 10, jobLink: 'javascript:alert(1)' },
  ]);
  if (/javascript:/i.test(html)) throw new Error(`unsafe scheme reached the email:\n${html}`);

  const missing = belowThresholdEmailSection([{ company: 'Acme', matchScore: 10 }]);
  if (missing.includes('<a href')) throw new Error('no link means no anchor');
});
