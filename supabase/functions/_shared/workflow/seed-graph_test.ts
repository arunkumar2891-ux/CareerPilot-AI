import { buildSeedEdges, DEFAULT_JOB_SEARCH_WORKFLOW } from '../../../../src/constants/workflow-seed.ts';

/**
 * The per-job fan-out runs from the first `insert_job` node until the
 * `email_summary` aggregate node. `Match Score` must sit inside that window,
 * and must come FIRST — it is the gate. Scoring against the master resume
 * before `ATS Optimizer` is what lets a low-scoring job skip the AI spend.
 */
Deno.test('seed places Match Score inside the fan-out, before ATS Optimizer', () => {
  const names = DEFAULT_JOB_SEARCH_WORKFLOW.nodes.map((n) => n.name);
  const store = names.indexOf('Store Job');
  const ats = names.indexOf('ATS Optimizer');
  const match = names.indexOf('Match Score');
  const latex = names.indexOf('Build LaTeX');
  const email = names.indexOf('Email Summary');

  for (const [label, idx] of Object.entries({ store, ats, match, latex, email })) {
    if (idx < 0) throw new Error(`missing node: ${label}`);
  }
  // The gate must precede every step it is meant to skip.
  if (!(match < ats)) throw new Error('Match Score must come before ATS Optimizer');
  if (!(ats < latex)) throw new Error('ATS Optimizer must come before Build LaTeX');
  // It must still run after Store Job: the score is written back to the job row,
  // and the fan-out itself begins at `insert_job`.
  if (!(store < match)) throw new Error('Match Score must come after Store Job');
  if (!(match < email)) throw new Error('Match Score must be inside the fan-out');
});

Deno.test('seed edges form one unbroken chain with a single poll loop', () => {
  const nodes = DEFAULT_JOB_SEARCH_WORKFLOW.nodes;
  const edges = buildSeedEdges(nodes.map((_, i) => String(i)));

  for (const { source, target } of edges) {
    if (!nodes[source] || !nodes[target]) {
      throw new Error(`edge ${source}->${target} points outside the node list`);
    }
  }

  // Every node except the trigger must be reachable, or part of the graph would
  // silently never execute.
  const reachable = new Set<number>([0]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const { source, target } of edges) {
      if (reachable.has(source) && !reachable.has(target)) {
        reachable.add(target);
        grew = true;
      }
    }
  }
  if (reachable.size !== nodes.length) {
    const missing = nodes.map((n, i) => (reachable.has(i) ? null : n.name)).filter(Boolean);
    throw new Error(`unreachable nodes: ${missing.join(', ')}`);
  }

  // Exactly one node may fork (Check Apify Status → true/false). Any other fork
  // means a stale edge was left behind and the run would branch unexpectedly.
  const forks = nodes
    .map((n, i) => ({ name: n.name, out: edges.filter((e) => e.source === i).length }))
    .filter((n) => n.out > 1);
  if (forks.length !== 1 || forks[0].name !== 'Check Apify Status') {
    throw new Error(`unexpected forks: ${JSON.stringify(forks)}`);
  }

  // The only back-edge is the Wait -> Check poll pair.
  const backEdges = edges.filter((e) => e.target <= e.source);
  if (backEdges.length !== 1) throw new Error(`expected 1 back-edge, got ${backEdges.length}`);
  if (nodes[backEdges[0].source].name !== 'Wait 10s') {
    throw new Error(`unexpected back-edge from ${nodes[backEdges[0].source].name}`);
  }
});
