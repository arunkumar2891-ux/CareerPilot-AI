import {
  currentSearchLabel,
  currentSearchLocation,
  currentSearchRole,
  findRoleLoopStart,
  groupJobExecutionsByRole,
  isFanInNode,
  isRemoteOnlySearch,
  isSharedPrefixNode,
  nextJobIndexOffset,
  roleSubgraphNodeIds,
  searchRoleForNode,
} from './role-loop.ts';
import type { WorkflowNodeRow } from './types.ts';

Deno.test('nextJobIndexOffset continues after existing job rows', () => {
  if (nextJobIndexOffset(undefined) !== 0) throw new Error('empty run');
  if (nextJobIndexOffset(10) !== 10) throw new Error('offset must follow the highest index');
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

Deno.test('findRoleLoopStart returns undefined for the tailoring workflow', () => {
  const nodes = [
    { id: 'load', type: 'supabase', config: { action: 'load_job' } },
    { id: 'ai', type: 'ai' },
  ];
  if (findRoleLoopStart(nodes)) throw new Error('tailoring must not be batched per role');
});

Deno.test('current* readers prefer the batch-seeded run context', () => {
  const vars = {
    currentRole: 'Integration Architect',
    currentLocation: 'India',
    remoteOnly: true,
    currentSearchLabel: 'Integration Architect · India remote',
  };
  if (currentSearchRole(vars) !== 'Integration Architect') throw new Error('role');
  if (currentSearchLocation(vars) !== 'India') throw new Error('location');
  if (!isRemoteOnlySearch(vars)) throw new Error('remoteOnly');
  if (currentSearchLabel(vars) !== 'Integration Architect · India remote') throw new Error('label');
});

Deno.test('current* readers fall back to settings for unbatched runs', () => {
  const vars: Record<string, unknown> = {};
  const jobSearch = { roles: ['EM'], location: 'San Francisco, CA' };
  if (currentSearchRole(vars, jobSearch) !== 'Engineering Manager') throw new Error('role fallback');
  if (currentSearchLocation(vars, jobSearch) !== 'San Francisco, CA') throw new Error('location fallback');
  if (currentSearchLocation(vars, {}) !== 'United States') throw new Error('default location');
  if (isRemoteOnlySearch(vars)) throw new Error('remoteOnly defaults off');
});

Deno.test('searchRoleForNode labels role nodes and skips shared and fan-in nodes', () => {
  const vars = { currentSearchLabel: 'Integration Architect · India remote' };
  const roleNode = { id: 'a', type: 'apify' } as unknown as WorkflowNodeRow;
  const sharedNode = { id: 'b', type: 'gdocs' } as unknown as WorkflowNodeRow;
  const fanInNode = { id: 'c', type: 'email' } as unknown as WorkflowNodeRow;
  if (searchRoleForNode(roleNode, vars) !== 'Integration Architect · India remote') {
    throw new Error('role node must carry the search label');
  }
  if (searchRoleForNode(sharedNode, vars) !== null) throw new Error('shared node');
  if (searchRoleForNode(fanInNode, vars) !== null) throw new Error('fan-in node');
  if (!isSharedPrefixNode({ type: 'gdocs' })) throw new Error('gdocs is shared');
  if (!isFanInNode({ type: 'function', config: { builtin: 'email_summary' } })) {
    throw new Error('email_summary is fan-in');
  }
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
