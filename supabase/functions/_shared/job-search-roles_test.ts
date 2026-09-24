import {
  alsoSearchIndiaRemote,
  buildSearchTargets,
  MAX_SEARCH_ROLES,
  maxJobsPerRole,
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

Deno.test('parseJobSearchRoles truncates beyond the role cap', () => {
  const roles = parseJobSearchRoles({
    roles: ['Role A', 'Role B', 'Role C', 'Role D', 'Role E', 'Role F', 'Role G'],
  });
  if (roles.length !== MAX_SEARCH_ROLES) throw new Error(String(roles.length));
  if (roles[0] !== 'Role A' || roles[4] !== 'Role E') throw new Error(String(roles));
  if (roles.includes('Role F')) throw new Error('cap must be enforced in the backend');
});

Deno.test('the role cap bounds daily runs and emails at 10', () => {
  const roles = ['Role A', 'Role B', 'Role C', 'Role D', 'Role E', 'Role F'];
  const withIndia = buildSearchTargets({
    roles,
    location: 'San Francisco, CA',
    alsoSearchIndiaRemote: true,
  });
  if (withIndia.length !== MAX_SEARCH_ROLES * 2) throw new Error(String(withIndia.length));
  const withoutIndia = buildSearchTargets({
    roles,
    location: 'San Francisco, CA',
    alsoSearchIndiaRemote: false,
  });
  if (withoutIndia.length !== MAX_SEARCH_ROLES) throw new Error(String(withoutIndia.length));
});

Deno.test('alsoSearchIndiaRemote is opt-in', () => {
  // Defaulting this on doubled every user's runs, AI spend, and summary emails
  // regardless of where they live.
  if (alsoSearchIndiaRemote(undefined)) throw new Error('undefined should be off');
  if (alsoSearchIndiaRemote({})) throw new Error('empty should be off');
  if (alsoSearchIndiaRemote({ alsoSearchIndiaRemote: false })) throw new Error('false');
  if (alsoSearchIndiaRemote({ alsoSearchIndiaRemote: 'false' })) throw new Error('string false');
  if (!alsoSearchIndiaRemote({ alsoSearchIndiaRemote: true })) throw new Error('true');
  if (!alsoSearchIndiaRemote({ alsoSearchIndiaRemote: 'true' })) throw new Error('string true');
});

Deno.test('buildSearchTargets adds India remote after each location scrape', () => {
  const targets = buildSearchTargets({
    roles: ['FDE', 'EM'],
    location: 'Bengaluru, India',
    alsoSearchIndiaRemote: true,
  });
  if (targets.length !== 4) throw new Error(String(targets.length));
  if (targets[0].location !== 'Bengaluru, India' || targets[0].remoteOnly) throw new Error('FDE location');
  if (targets[1].location !== 'India' || !targets[1].remoteOnly) throw new Error('FDE India remote');
  if (targets[1].role !== 'Forward Deployed Engineer') throw new Error(targets[1].role);
  if (!String(targets[1].label).includes('India remote')) throw new Error(targets[1].label);
  if (targets[2].role !== 'Engineering Manager' || targets[2].remoteOnly) throw new Error('EM location');
  if (targets[3].role !== 'Engineering Manager' || !targets[3].remoteOnly) throw new Error('EM India remote');
});

Deno.test('buildSearchTargets omits India remote by default', () => {
  const targets = buildSearchTargets({
    roles: ['EM', 'SWE'],
    location: 'San Francisco, CA',
  });
  if (targets.length !== 2) throw new Error(String(targets.length));
  if (targets.some((target) => target.remoteOnly)) throw new Error('unexpected remote scrape');
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
