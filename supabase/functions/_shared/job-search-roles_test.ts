import { maxJobsPerRole, nextSearchRole, parseJobSearchRoles } from './job-search-roles.ts';

Deno.test('parseJobSearchRoles reads multiple roles and expands aliases', () => {
  const roles = parseJobSearchRoles({
    query: 'AI Product Manager',
    roles: ['FDE', 'Engineering Manager', 'fde'],
  });
  if (roles.length !== 2) throw new Error(`expected 2 unique roles, got ${roles.join(', ')}`);
  if (roles[0] !== 'Forward Deployed Engineer') throw new Error(roles[0]);
  if (roles[1] !== 'Engineering Manager') throw new Error(roles[1]);
});

Deno.test('parseJobSearchRoles ignores empty role entries', () => {
  const roles = parseJobSearchRoles({ roles: ['', '  ', 'EM'] });
  if (roles.length !== 1 || roles[0] !== 'Engineering Manager') throw new Error(String(roles));
});

Deno.test('parseJobSearchRoles falls back to the legacy query field', () => {
  const roles = parseJobSearchRoles({ query: 'SWE' });
  if (roles.length !== 1 || roles[0] !== 'Software Engineer') throw new Error(String(roles));
});

Deno.test('maxJobsPerRole caps and defaults', () => {
  if (maxJobsPerRole({ maxJobs: '10' }) !== 10) throw new Error('string 10');
  if (maxJobsPerRole({ maxJobs: '0' }) !== 5) throw new Error('zero');
  if (maxJobsPerRole({ maxJobs: '99' }) !== 40) throw new Error('cap');
  if (maxJobsPerRole(undefined) !== 5) throw new Error('default');
});

Deno.test('nextSearchRole walks child pipelines then stops', () => {
  const roles = ['Forward Deployed Engineer', 'Engineering Manager'];
  const second = nextSearchRole(roles, 0);
  if (!second || second.role !== 'Engineering Manager' || second.index !== 1) {
    throw new Error(JSON.stringify(second));
  }
  if (nextSearchRole(roles, 1) !== null) throw new Error('last role must stop');
});
