import {
  JOB_KANBAN_COLUMNS,
  groupJobsByStatus,
  isKnownJobStatus,
  isRedundantMove,
  jobMoveWarning,
  jobStatusLabel,
  withJobStatus,
} from './job-kanban.ts';
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

Deno.test('columns cover every JobStatus exactly once, in pipeline order', () => {
  const statuses = JOB_KANBAN_COLUMNS.map((c) => c.status);
  const expected = [
    'discovered', 'queued', 'resume_ready', 'applied',
    'interview', 'offer', 'rejected', 'withdrawn',
  ];
  if (statuses.join(',') !== expected.join(',')) {
    throw new Error(`column order drifted: ${statuses.join(',')}`);
  }
  if (new Set(statuses).size !== statuses.length) throw new Error('duplicate column');
  for (const c of JOB_KANBAN_COLUMNS) {
    if (!c.label.trim()) throw new Error(`${c.status} needs a label`);
    if (!c.hint.trim()) throw new Error(`${c.status} needs an empty-state hint`);
  }
});

Deno.test('isKnownJobStatus accepts columns and rejects junk', () => {
  if (!isKnownJobStatus('discovered')) throw new Error('discovered is a column');
  if (!isKnownJobStatus('withdrawn')) throw new Error('withdrawn is a column');
  if (isKnownJobStatus('')) throw new Error('empty is not a status');
  if (isKnownJobStatus('archived')) throw new Error('unknown status must be rejected');
});

Deno.test('jobStatusLabel maps to the column label and falls back to the raw value', () => {
  if (jobStatusLabel('resume_ready') !== 'Resume Ready') throw new Error('label wrong');
  if (jobStatusLabel('mystery') !== 'mystery') throw new Error('should fall back to raw');
});

Deno.test('groupJobsByStatus buckets jobs and always returns every column', () => {
  const { columns, unfiled } = groupJobsByStatus([
    job({ id: 'a', status: 'discovered' }),
    job({ id: 'b', status: 'applied' }),
    job({ id: 'c', status: 'discovered' }),
  ]);
  if (columns.length !== JOB_KANBAN_COLUMNS.length) throw new Error('every column must render');
  const discovered = columns.find((c) => c.column.status === 'discovered')!;
  if (discovered.jobs.map((j) => j.id).join(',') !== 'a,c') {
    throw new Error('discovered bucket wrong or reordered');
  }
  if (columns.find((c) => c.column.status === 'offer')!.jobs.length !== 0) {
    throw new Error('empty columns must still be present');
  }
  if (unfiled.length !== 0) throw new Error('nothing should be unfiled here');
});

Deno.test('groupJobsByStatus surfaces unknown statuses instead of dropping them', () => {
  const { columns, unfiled } = groupJobsByStatus([
    job({ id: 'a', status: 'discovered' }),
    job({ id: 'weird', status: 'archived' as Job['status'] }),
  ]);
  if (unfiled.map((j) => j.id).join(',') !== 'weird') {
    throw new Error('unknown status must land in unfiled so it cannot vanish');
  }
  const total = columns.reduce((n, c) => n + c.jobs.length, 0) + unfiled.length;
  if (total !== 2) throw new Error('no job may be lost or duplicated');
});

Deno.test('withJobStatus changes one job and preserves order', () => {
  const jobs = [
    job({ id: 'a', status: 'discovered' }),
    job({ id: 'b', status: 'discovered' }),
    job({ id: 'c', status: 'queued' }),
  ];
  const next = withJobStatus(jobs, 'b', 'offer');
  if (next.map((j) => j.id).join(',') !== 'a,b,c') {
    throw new Error('a dropped card must not jump position');
  }
  if (next[1].status !== 'offer') throw new Error('target job not updated');
  if (next[0].status !== 'discovered' || next[2].status !== 'queued') {
    throw new Error('other jobs must be untouched');
  }
  // Must not mutate: the rollback path relies on the previous array staying intact.
  if (jobs[1].status !== 'discovered') throw new Error('input array was mutated');
});

Deno.test('withJobStatus is a harmless no-op for an unknown id', () => {
  const jobs = [job({ id: 'a' })];
  const next = withJobStatus(jobs, 'missing', 'offer');
  if (next.length !== 1 || next[0].status !== 'discovered') throw new Error('should be unchanged');
});

Deno.test('isRedundantMove catches dropping a card back in its own column', () => {
  if (!isRedundantMove(job({ id: 'a', status: 'queued' }), 'queued')) {
    throw new Error('same-column drop must be skipped, not written to the DB');
  }
  if (isRedundantMove(job({ id: 'a', status: 'queued' }), 'applied')) {
    throw new Error('a real move must not be skipped');
  }
});

Deno.test('jobMoveWarning flags Resume Ready without a resume', () => {
  const bare = job({ id: 'a' });
  if (!jobMoveWarning(bare, 'resume_ready')) throw new Error('should warn: no resume');
  if (jobMoveWarning(job({ id: 'a', resumeId: 'r1' }), 'resume_ready')) {
    throw new Error('a job with a resume must not warn');
  }
  if (jobMoveWarning(job({ id: 'a', pdfUrl: 'https://x/a.pdf' }), 'resume_ready')) {
    throw new Error('a job with a PDF must not warn');
  }
  if (jobMoveWarning(job({ id: 'a', resumeStatus: 'ready' }), 'resume_ready')) {
    throw new Error('resumeStatus ready must not warn');
  }
});

Deno.test('jobMoveWarning stays quiet for ordinary moves', () => {
  const bare = job({ id: 'a' });
  for (const status of ['discovered', 'queued', 'interview', 'offer', 'rejected', 'withdrawn'] as const) {
    if (jobMoveWarning(bare, status)) throw new Error(`${status} should not warn`);
  }
  if (!jobMoveWarning(bare, 'applied')) throw new Error('applied without a resume should warn');
});
