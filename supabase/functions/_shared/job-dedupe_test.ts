import {
  collectJobDedupeKeys,
  emptyJobRunDetail,
  filterDuplicateJobs,
  isDuplicateConstraintError,
  isDuplicateSkipOutput,
  jobContentFingerprint,
  resolveJobInsertConflict,
} from './job-dedupe.ts';

Deno.test('filterDuplicateJobs keeps one copy when seven rows share the same LinkedIn URL', () => {
  const url = 'https://www.linkedin.com/jobs/view/123456/';
  const items = Array.from({ length: 7 }, () => ({
    title: 'Machine Learning Engineer',
    company: 'Exterro India',
    location: 'Chennai',
    jobLink: url,
    jobDescription: 'Build ranking models.',
  }));
  const { kept, skippedDuplicate } = filterDuplicateJobs(items);
  if (kept.length !== 1) throw new Error(`expected 1 kept, got ${kept.length}`);
  if (skippedDuplicate !== 6) throw new Error(`expected 6 skipped, got ${skippedDuplicate}`);
});

Deno.test('filterDuplicateJobs collapses the same posting with different LinkedIn IDs', () => {
  const description = 'Build ranking models for enterprise e-discovery in Chennai.';
  const { kept, skippedDuplicate } = filterDuplicateJobs([
    {
      title: 'Machine Learning Engineer',
      company: 'Exterro India',
      location: 'Chennai',
      jobDescription: description,
      jobLink: 'https://www.linkedin.com/jobs/view/111',
    },
    {
      title: 'Machine Learning Engineer',
      company: 'Exterro India',
      location: 'Chennai',
      jobDescription: description,
      jobLink: 'https://www.linkedin.com/jobs/view/999',
    },
  ]);
  if (kept.length !== 1) throw new Error(`expected 1 kept, got ${kept.length}`);
  if (skippedDuplicate !== 1) throw new Error(`expected 1 skipped, got ${skippedDuplicate}`);
});

Deno.test('filterDuplicateJobs skips jobs already stored by URL or fingerprint', () => {
  const description = 'Ship production ML pipelines.';
  const existing = collectJobDedupeKeys({
    company: 'Exterro India',
    role: 'Machine Learning Engineer',
    location: 'Chennai',
    description,
    url: 'https://www.linkedin.com/jobs/view/111',
  });
  const { kept, skippedDuplicate } = filterDuplicateJobs(
    [{
      title: 'Machine Learning Engineer',
      company: 'Exterro India',
      location: 'Chennai',
      jobDescription: description,
      jobLink: 'https://www.linkedin.com/jobs/view/222',
    }],
    existing,
  );
  if (kept.length !== 0) throw new Error(`stored fingerprint should skip, kept ${kept.length}`);
  if (skippedDuplicate !== 1) throw new Error(`expected skip, got ${skippedDuplicate}`);
});

Deno.test('jobContentFingerprint ignores description whitespace and casing', () => {
  const a = jobContentFingerprint({
    company: 'Exterro India',
    title: 'Machine Learning Engineer',
    location: 'Chennai',
    jobDescription: 'Build  models.\n\nShip them.',
  });
  const b = jobContentFingerprint({
    company: '  EXTERRO INDIA ',
    role: 'Machine Learning Engineer',
    location: 'Chennai',
    description: 'Build models. Ship them.',
  });
  if (a !== b) throw new Error(`fingerprints differ:\n${a}\n${b}`);
});

Deno.test('filterDuplicateJobs keeps unique listings while dropping copies of the same URL', () => {
  const shared = 'https://www.linkedin.com/jobs/view/111/';
  const { kept, skippedDuplicate } = filterDuplicateJobs([
    { title: 'ML Engineer', company: 'Exterro India', jobLink: shared },
    { title: 'ML Engineer', company: 'Exterro India', jobLink: shared },
    { title: 'ML Engineer', company: 'Exterro India', jobLink: shared },
    { title: 'Data Engineer', company: 'Acme', jobLink: 'https://www.linkedin.com/jobs/view/222/' },
  ]);
  if (kept.length !== 2) throw new Error(`expected 2 unique jobs, kept ${kept.length}`);
  if (skippedDuplicate !== 2) throw new Error(`expected 2 copies skipped, got ${skippedDuplicate}`);
  const urls = kept.map((job) => String(job.jobLink)).sort();
  if (urls[0] !== 'https://www.linkedin.com/jobs/view/111' || urls[1] !== 'https://www.linkedin.com/jobs/view/222') {
    throw new Error(`unexpected kept urls: ${urls.join(', ')}`);
  }
});

Deno.test('filterDuplicateJobs keeps nothing when every listing is already stored', () => {
  const url = 'https://www.linkedin.com/jobs/view/123456/';
  const existing = collectJobDedupeKeys({ url, company: 'Exterro India', role: 'ML Engineer' });
  const { kept, skippedDuplicate } = filterDuplicateJobs(
    Array.from({ length: 5 }, () => ({
      title: 'ML Engineer',
      company: 'Exterro India',
      jobLink: url,
    })),
    existing,
  );
  if (kept.length !== 0) throw new Error(`expected no new jobs, kept ${kept.length}`);
  if (skippedDuplicate !== 5) throw new Error(`expected 5 skipped, got ${skippedDuplicate}`);
});

Deno.test('isDuplicateConstraintError treats unique-index races as duplicates, not failures', () => {
  if (!isDuplicateConstraintError({ code: '23505', message: 'duplicate key value violates unique constraint' })) {
    throw new Error('Postgres 23505 must be a duplicate');
  }
  if (!isDuplicateConstraintError({
    message: 'duplicate key value violates unique constraint "jobs_user_url_uidx"',
  })) {
    throw new Error('jobs_user_url_uidx must be a duplicate');
  }
  if (!isDuplicateConstraintError({
    details: 'Key (user_id, url)=(...) already exists.',
    message: 'unique constraint',
  })) {
    throw new Error('unique constraint text must be a duplicate');
  }
  if (isDuplicateConstraintError({ code: '23514', message: 'check constraint' })) {
    throw new Error('check constraint must still fail');
  }
  if (isDuplicateConstraintError(null)) throw new Error('null is not a duplicate');
});

Deno.test('resolveJobInsertConflict skips even when the existing row cannot be loaded', () => {
  const skip = resolveJobInsertConflict(
    { code: '23505', message: 'duplicate key value violates unique constraint "jobs_user_url_uidx"' },
    null,
  );
  if (!skip) throw new Error('unique violation must skip, not throw');
  if (skip.reason !== 'duplicate') throw new Error(skip.reason);
  if (skip.jobId) throw new Error('missing existing id should omit jobId');
});

Deno.test('resolveJobInsertConflict keeps the raced job id when lookup succeeds', () => {
  const skip = resolveJobInsertConflict({ code: '23505', message: 'duplicate key' }, 'job-9');
  if (!skip || skip.jobId !== 'job-9') throw new Error('should attach raced job id');
});

Deno.test('resolveJobInsertConflict does not swallow unrelated insert errors', () => {
  const skip = resolveJobInsertConflict({ code: '23514', message: 'check constraint' }, 'job-9');
  if (skip) throw new Error('check constraint must still fail the insert');
});

Deno.test('isDuplicateSkipOutput only matches duplicate skips', () => {
  if (!isDuplicateSkipOutput({ skipped: true, reason: 'duplicate' })) {
    throw new Error('duplicate skip should short-circuit the job pipeline');
  }
  if (isDuplicateSkipOutput({ skipped: true, reason: 'no_google_doc' })) {
    throw new Error('other skips must not be treated as URL duplicates');
  }
  if (isDuplicateSkipOutput({ title: 'Engineer' })) {
    throw new Error('new jobs must continue the pipeline');
  }
});

Deno.test('emptyJobRunDetail reports no new jobs when only duplicates remain', () => {
  const allStored = emptyJobRunDetail({
    scraped: 36,
    parsed: 19,
    afterDedupe: 0,
    skippedDuplicate: 19,
    skippedNoLink: 0,
  });
  if (!/already in your jobs table/i.test(allStored) || !/no new listings/i.test(allStored)) {
    throw new Error(allStored);
  }

  const insertRace = emptyJobRunDetail({
    scraped: 7,
    parsed: 7,
    afterDedupe: 7,
    skippedDuplicate: 0,
    skippedNoLink: 0,
    skippedInsertDuplicate: 7,
  });
  if (!/already in your jobs table/i.test(insertRace)) throw new Error(insertRace);
});
