import {
  type JobFilterCriteria,
  errorMessageOr,
  filterJobs,
  isGmailScopeError,
  matchesJobFilters,
  selectApplyableJobs,
  selectExtractableJobs,
} from './job-filters.ts';
import type { Job } from '../types';

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    company: 'Acme',
    role: 'Engineer',
    description: '',
    matchScore: 50,
    skills: [],
    postingDate: '2026-01-01',
    source: 'test',
    location: 'Remote',
    remote: true,
    hybrid: false,
    duplicate: false,
    resumeStatus: 'none',
    applicationStatus: 'draft',
    status: 'discovered',
    createdAt: '2026-01-01',
    ...partial,
  } as Job;
}

function criteria(partial: Partial<JobFilterCriteria> = {}): JobFilterCriteria {
  return { search: '', remote: false, hybrid: false, experience: '', salaryMin: '', ...partial };
}

function ids(jobs: Job[]): string {
  return jobs.map((j) => j.id).join(',');
}

// --- matchesJobFilters -------------------------------------------------------

Deno.test('empty criteria matches every job', () => {
  if (!matchesJobFilters(job({ id: 'a' }), criteria())) throw new Error('should match');
});

Deno.test('search matches role or company, case-insensitively', () => {
  const j = job({ id: 'a', role: 'Senior Frontend Engineer', company: 'Stripe' });
  if (!matchesJobFilters(j, criteria({ search: 'frontend' }))) throw new Error('role should match');
  if (!matchesJobFilters(j, criteria({ search: 'STRIPE' }))) throw new Error('company should match');
  if (!matchesJobFilters(j, criteria({ search: 'FRONTend enginEER' }))) throw new Error('mixed case should match');
  if (matchesJobFilters(j, criteria({ search: 'backend' }))) throw new Error('non-match should be excluded');
});

Deno.test('whitespace-only search is treated as no search', () => {
  // Otherwise typing a space blanks the entire list.
  if (!matchesJobFilters(job({ id: 'a', role: 'Engineer' }), criteria({ search: '   ' }))) {
    throw new Error('blank search must not filter anything out');
  }
});

Deno.test('remote and hybrid narrow independently', () => {
  const remoteOnly = job({ id: 'a', remote: true, hybrid: false });
  const hybridOnly = job({ id: 'b', remote: false, hybrid: true });
  const both = job({ id: 'c', remote: true, hybrid: true });

  if (!matchesJobFilters(remoteOnly, criteria({ remote: true }))) throw new Error('remote job passes remote filter');
  if (matchesJobFilters(hybridOnly, criteria({ remote: true }))) throw new Error('non-remote job fails remote filter');

  // Both flags on is an AND, not an OR — only a job flagged both survives.
  if (matchesJobFilters(remoteOnly, criteria({ remote: true, hybrid: true }))) {
    throw new Error('remote-only job must not pass remote+hybrid');
  }
  if (!matchesJobFilters(both, criteria({ remote: true, hybrid: true }))) {
    throw new Error('job flagged both must pass remote+hybrid');
  }
});

Deno.test('experience is an exact match and empty means any', () => {
  const j = job({ id: 'a', experience: 'Senior' });
  if (!matchesJobFilters(j, criteria({ experience: 'Senior' }))) throw new Error('exact match should pass');
  if (matchesJobFilters(j, criteria({ experience: 'Mid' }))) throw new Error('different level should fail');
  if (!matchesJobFilters(j, criteria({ experience: '' }))) throw new Error('empty means any');
  if (matchesJobFilters(job({ id: 'b' }), criteria({ experience: 'Senior' }))) {
    throw new Error('job with no experience must not match a specific level');
  }
});

Deno.test('salaryMin compares numerically, and a job with no salary counts as 0', () => {
  if (!matchesJobFilters(job({ id: 'a', salaryMin: 150000 }), criteria({ salaryMin: '120000' }))) {
    throw new Error('above minimum should pass');
  }
  if (matchesJobFilters(job({ id: 'b', salaryMin: 90000 }), criteria({ salaryMin: '120000' }))) {
    throw new Error('below minimum should fail');
  }
  if (!matchesJobFilters(job({ id: 'c', salaryMin: 120000 }), criteria({ salaryMin: '120000' }))) {
    throw new Error('boundary is inclusive');
  }
  if (matchesJobFilters(job({ id: 'd' }), criteria({ salaryMin: '1' }))) {
    throw new Error('missing salary is treated as 0 and excluded by any positive minimum');
  }
});

Deno.test('non-numeric salaryMin does not blank the list', () => {
  // A form input can hold junk. NaN comparisons are always false, so a naive
  // implementation would exclude everything.
  if (!matchesJobFilters(job({ id: 'a', salaryMin: 100 }), criteria({ salaryMin: 'abc' }))) {
    throw new Error('unparseable minimum must be ignored');
  }
});

Deno.test('filters compose — all must pass', () => {
  const j = job({ id: 'a', role: 'Engineer', remote: true, experience: 'Senior', salaryMin: 150000 });
  const all = criteria({ search: 'engineer', remote: true, experience: 'Senior', salaryMin: '120000' });
  if (!matchesJobFilters(j, all)) throw new Error('job satisfying every filter should pass');
  if (matchesJobFilters(j, { ...all, salaryMin: '200000' })) throw new Error('one failing filter excludes the job');
});

// --- filterJobs --------------------------------------------------------------

Deno.test('filterJobs tolerates undefined and preserves order', () => {
  if (filterJobs(undefined, criteria()).length !== 0) throw new Error('undefined must yield []');

  const result = filterJobs(
    [job({ id: 'a', remote: true }), job({ id: 'b', remote: false }), job({ id: 'c', remote: true })],
    criteria({ remote: true }),
  );
  if (ids(result) !== 'a,c') throw new Error(`expected a,c got ${ids(result)}`);
});

// --- selectApplyableJobs (gates real email) ----------------------------------

Deno.test('selectApplyableJobs requires selection, address, ready resume, and not-yet-applied', () => {
  const ok = job({ id: 'ok', applyEmail: 'a@b.com', resumeStatus: 'ready', status: 'resume_ready' });
  const notSelected = job({ id: 'notSelected', applyEmail: 'a@b.com', resumeStatus: 'ready' });
  const noEmail = job({ id: 'noEmail', resumeStatus: 'ready' });
  const resumeNotReady = job({ id: 'resumeNotReady', applyEmail: 'a@b.com', resumeStatus: 'generating' });
  const alreadyApplied = job({ id: 'alreadyApplied', applyEmail: 'a@b.com', resumeStatus: 'ready', status: 'applied' });

  const selected = new Set(['ok', 'noEmail', 'resumeNotReady', 'alreadyApplied']);
  const result = selectApplyableJobs([ok, notSelected, noEmail, resumeNotReady, alreadyApplied], selected);

  if (ids(result) !== 'ok') throw new Error(`only "ok" is applyable, got: ${ids(result) || '(none)'}`);
});

Deno.test('selectApplyableJobs rejects an empty apply email', () => {
  // `!!''` is false, so an empty string must not count as having an address.
  const j = job({ id: 'a', applyEmail: '', resumeStatus: 'ready' });
  if (selectApplyableJobs([j], new Set(['a'])).length !== 0) {
    throw new Error('empty applyEmail must not be applyable');
  }
});

Deno.test('selectApplyableJobs returns nothing when the selection is empty', () => {
  const j = job({ id: 'a', applyEmail: 'a@b.com', resumeStatus: 'ready' });
  if (selectApplyableJobs([j], new Set<string>()).length !== 0) {
    throw new Error('no selection means no email is ever sent');
  }
  if (selectApplyableJobs(undefined, new Set(['a'])).length !== 0) throw new Error('undefined must yield []');
});

// --- selectExtractableJobs ---------------------------------------------------

Deno.test('selectExtractableJobs picks selected jobs that lack an address', () => {
  const needs = job({ id: 'needs' });
  const has = job({ id: 'has', applyEmail: 'a@b.com' });
  const unselected = job({ id: 'unselected' });

  const result = selectExtractableJobs([needs, has, unselected], new Set(['needs', 'has']));
  if (ids(result) !== 'needs') throw new Error(`expected needs, got ${ids(result) || '(none)'}`);
});

// --- isGmailScopeError -------------------------------------------------------

Deno.test('isGmailScopeError recognises both the code and the human message', () => {
  if (!isGmailScopeError(new Error('gmail_scope_missing'))) throw new Error('code should match');
  if (!isGmailScopeError(new Error('Please reconnect Google to continue'))) throw new Error('message should match');
  if (!isGmailScopeError(new Error('GMAIL_SCOPE_MISSING'))) throw new Error('should be case-insensitive');
  if (!isGmailScopeError('reconnect google')) throw new Error('bare string should be handled');
});

Deno.test('isGmailScopeError ignores unrelated failures and non-errors', () => {
  if (isGmailScopeError(new Error('network timeout'))) throw new Error('unrelated error must not match');
  if (isGmailScopeError(null)) throw new Error('null must not match');
  if (isGmailScopeError(undefined)) throw new Error('undefined must not match');
});

// --- errorMessageOr ----------------------------------------------------------

Deno.test('errorMessageOr prefers the Error message and falls back otherwise', () => {
  if (errorMessageOr(new Error('boom'), 'fallback') !== 'boom') throw new Error('should use Error message');
  if (errorMessageOr(new Error(''), 'fallback') !== 'fallback') throw new Error('empty message should fall back');
  if (errorMessageOr('a string', 'fallback') !== 'fallback') throw new Error('non-Error should fall back');
  if (errorMessageOr(undefined, 'fallback') !== 'fallback') throw new Error('undefined should fall back');
});
