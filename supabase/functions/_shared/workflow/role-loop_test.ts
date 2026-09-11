import {
  applyNextSearchRole,
  ensureSearchRoleContext,
  findRoleLoopStart,
  groupJobExecutionsByRole,
  nextJobIndexOffset,
  roleSubgraphNodeIds,
} from './role-loop.ts';

Deno.test('ensureSearchRoleContext seeds roles from settings once', () => {
  const vars: Record<string, unknown> = {};
  const roles = ensureSearchRoleContext(vars, { roles: ['FDE', 'Engineering Manager'] });
  if (roles.length !== 2) throw new Error(String(roles));
  if (vars.currentRole !== 'Forward Deployed Engineer') throw new Error(String(vars.currentRole));
  if (vars.roleIndex !== 0) throw new Error(String(vars.roleIndex));
  const again = ensureSearchRoleContext(vars, { roles: ['ignored'] });
  if (again[0] !== roles[0]) throw new Error('must keep the run-scoped role list');
});

Deno.test('applyNextSearchRole resets per-role scrape state', () => {
  const vars: Record<string, unknown> = {
    roleIndex: 0,
    currentRole: 'Forward Deployed Engineer',
    jobExecutionsInitialized: true,
    pendingJobItems: [{ id: 1 }],
    apifyRunId: 'run-1',
  };
  const moved = applyNextSearchRole(vars, ['Forward Deployed Engineer', 'Engineering Manager']);
  if (!moved) throw new Error('expected a second role');
  if (vars.currentRole !== 'Engineering Manager') throw new Error(String(vars.currentRole));
  if (vars.roleIndex !== 1) throw new Error(String(vars.roleIndex));
  if (vars.jobExecutionsInitialized) throw new Error('must re-init job executions');
  if (vars.pendingJobItems) throw new Error('pending jobs must not leak into the next role');
  if (vars.apifyRunId) throw new Error('apify run must reset');
  if (applyNextSearchRole(vars, ['Forward Deployed Engineer', 'Engineering Manager'])) {
    throw new Error('last role must stop');
  }
});

Deno.test('nextJobIndexOffset continues after the previous role', () => {
  if (nextJobIndexOffset(undefined) !== 0) throw new Error('empty run');
  if (nextJobIndexOffset(10) !== 10) throw new Error('role 2 starts at 11');
});

Deno.test('roleSubgraphNodeIds walks Build URL through Storage and skips email', () => {
  const nodes = [
    { id: 'gdocs', type: 'gdocs' },
    { id: 'url', type: 'transform', config: { action: 'build_linkedin_url' } },
    { id: 'apify', type: 'apify' },
    { id: 'wait', type: 'wait' },
    { id: 'store', type: 'supabase', config: { action: 'insert_job' } },
    { id: 'email', type: 'function', config: { builtin: 'email_summary' } },
    { id: 'send', type: 'email' },
  ];
  const edges = [
    { source_id: 'gdocs', target_id: 'url' },
    { source_id: 'url', target_id: 'apify' },
    { source_id: 'apify', target_id: 'wait' },
    { source_id: 'wait', target_id: 'apify' },
    { source_id: 'apify', target_id: 'store' },
    { source_id: 'store', target_id: 'email' },
    { source_id: 'email', target_id: 'send' },
  ];
  const ids = roleSubgraphNodeIds(nodes, edges);
  if (!ids.has('url') || !ids.has('wait') || !ids.has('store')) throw new Error('missing role nodes');
  if (ids.has('gdocs') || ids.has('email') || ids.has('send')) throw new Error('shared nodes leaked');
  if (findRoleLoopStart(nodes)?.id !== 'url') throw new Error('loop start');
});

Deno.test('groupJobExecutionsByRole keeps first-seen order and drops unlabeled jobs', () => {
  const groups = groupJobExecutionsByRole([
    { searchRole: 'Forward Deployed Engineer' },
    { searchRole: 'Engineering Manager' },
    { searchRole: 'Forward Deployed Engineer' },
    { searchRole: null },
  ]);
  if (groups.length !== 2) throw new Error(String(groups.length));
  if (groups[0].role !== 'Forward Deployed Engineer' || groups[0].items.length !== 2) {
    throw new Error('FDE group');
  }
  if (groups[1].items.length !== 1) throw new Error('EM group');
});
