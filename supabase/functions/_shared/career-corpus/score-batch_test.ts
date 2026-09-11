import {
  chunkItems,
  groupJobsByResumeText,
  parseScoreJobIds,
  resumeForJob,
  TAILORED_RESUME_MIN_CHARS,
} from './score-batch.ts';

Deno.test('parseScoreJobIds uniquifies and drops blanks', () => {
  const ids = parseScoreJobIds([' a ', '', 'b', 'a', 'b']);
  if (ids.join(',') !== 'a,b') throw new Error(String(ids));
});

Deno.test('parseScoreJobIds accepts a single id', () => {
  const ids = parseScoreJobIds('job-1');
  if (ids.length !== 1 || ids[0] !== 'job-1') throw new Error(String(ids));
});

Deno.test('chunkItems splits into fixed-size groups', () => {
  const chunks = chunkItems([1, 2, 3, 4, 5], 2);
  if (chunks.length !== 3) throw new Error(String(chunks.length));
  if (chunks[0].join(',') !== '1,2' || chunks[2].join(',') !== '5') throw new Error(JSON.stringify(chunks));
});

Deno.test('resumeForJob uses tailored text when long enough, otherwise master', () => {
  const tailored = new Map([
    ['job-1', { name: 'Tailored A', text: 'x'.repeat(TAILORED_RESUME_MIN_CHARS) }],
    ['job-2', { name: 'Short', text: 'too short' }],
  ]);
  const master = { name: 'Master', text: 'master resume text that is long enough' };
  if (resumeForJob('job-1', tailored, master).name !== 'Tailored A') throw new Error('tailored');
  if (resumeForJob('job-2', tailored, master).name !== 'Master') throw new Error('short tailored');
  if (resumeForJob('job-3', tailored, master).name !== 'Master') throw new Error('missing tailored');
});

Deno.test('groupJobsByResumeText batches master jobs and keeps unique tailored resumes apart', () => {
  const master = { name: 'Master', text: 'MASTER' };
  const tailored = new Map([
    ['t1', { name: 'T1', text: 'x'.repeat(TAILORED_RESUME_MIN_CHARS) }],
  ]);
  const groups = groupJobsByResumeText(
    [{ id: 'a' }, { id: 't1' }, { id: 'b' }],
    tailored,
    master,
  );
  if (groups.length !== 2) throw new Error(String(groups.length));
  if (groups[0].jobs.map((j) => j.id).join(',') !== 'a,b') throw new Error('master group');
  if (groups[1].jobs.map((j) => j.id).join(',') !== 't1') throw new Error('tailored group');
});
