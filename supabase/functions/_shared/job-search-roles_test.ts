import {
  alsoSearchIndiaRemote,
  buildSearchTargets,
  maxJobsPerRole,
  nextSearchRole,
  parseJobSearchRoles,
} from './job-search-roles.ts';

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

Deno.test('alsoSearchIndiaRemote defaults on', () => {
  if (!alsoSearchIndiaRemote(undefined)) throw new Error('undefined');
  if (!alsoSearchIndiaRemote({})) throw new Error('empty');
  if (alsoSearchIndiaRemote({ alsoSearchIndiaRemote: false })) throw new Error('false');
  if (alsoSearchIndiaRemote({ alsoSearchIndiaRemote: 'false' })) throw new Error('string false');
});

Deno.test('buildSearchTargets adds India remote after each location scrape', () => {
  const targets = buildSearchTargets({
    roles: ['FDE', 'EM'],
    location: 'Bengaluru, India',
  });
  if (targets.length !== 4) throw new Error(String(targets.length));
  if (targets[0].location !== 'Bengaluru, India' || targets[0].remoteOnly) throw new Error('FDE location');
  if (targets[1].location !== 'India' || !targets[1].remoteOnly) throw new Error('FDE India remote');
  if (targets[1].role !== 'Forward Deployed Engineer') throw new Error(targets[1].role);
  if (!String(targets[1].label).includes('India remote')) throw new Error(targets[1].label);
  if (targets[2].role !== 'Engineering Manager' || targets[2].remoteOnly) throw new Error('EM location');
  if (targets[3].role !== 'Engineering Manager' || !targets[3].remoteOnly) throw new Error('EM India remote');
});

Deno.test('buildSearchTargets skips India remote when disabled', () => {
  const targets = buildSearchTargets({
    roles: ['EM', 'SWE'],
    location: 'San Francisco, CA',
    alsoSearchIndiaRemote: false,
  });
  if (targets.length !== 2) throw new Error(String(targets.length));
  if (targets.some((target) => target.remoteOnly)) throw new Error('unexpected remote scrape');
});
