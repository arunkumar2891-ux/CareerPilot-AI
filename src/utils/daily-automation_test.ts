import {
  shouldProvisionDailyAutomation,
  shouldRefreshNextRun,
  pickDailyAutomation,
  type AutomationSibling,
} from './daily-automation.ts';

function sibling(id: string, status: string, workflowId = 'wf-1'): AutomationSibling {
  return { id, workflow_id: workflowId, status };
}

Deno.test('provisions a daily automation for a brand-new account', () => {
  if (shouldProvisionDailyAutomation([], false) !== true) {
    throw new Error('a fresh account with no automations should be provisioned');
  }
});

Deno.test('does not provision when the workflow already has its own row', () => {
  if (shouldProvisionDailyAutomation([sibling('a', 'active')], true) !== false) {
    throw new Error('an existing row must not be duplicated');
  }
});

Deno.test('does not provision when an active sibling already covers the schedule', () => {
  const siblings = [sibling('a', 'active', 'wf-other')];
  if (shouldProvisionDailyAutomation(siblings, false) !== false) {
    throw new Error('an active sibling already runs the schedule');
  }
});

Deno.test('does not resurrect the daily run when the user paused it', () => {
  /* The regression this file exists for: the user turns the toggle off, leaving
     only a paused row on a sibling workflow. Login must not insert a new active
     row and restart the schedule. */
  const siblings = [sibling('a', 'paused', 'wf-other')];
  if (shouldProvisionDailyAutomation(siblings, false) !== false) {
    throw new Error('a paused automation must not be replaced by an active one');
  }
});

Deno.test('does not resurrect the run when every sibling is paused', () => {
  const siblings = [sibling('a', 'paused', 'wf-1'), sibling('b', 'paused', 'wf-2')];
  if (shouldProvisionDailyAutomation(siblings, false) !== false) {
    throw new Error('all-paused must stay paused');
  }
});

Deno.test('still provisions when the only sibling errored', () => {
  /* An 'error' status is a failed run, not a user decision to stop. */
  const siblings = [sibling('a', 'error', 'wf-other')];
  if (shouldProvisionDailyAutomation(siblings, false) !== true) {
    throw new Error('an errored automation is not a deliberate pause');
  }
});

Deno.test('only active automations get their next_run refreshed', () => {
  if (shouldRefreshNextRun('active') !== true) throw new Error('active should refresh');
  if (shouldRefreshNextRun('paused') !== false) throw new Error('paused must not refresh');
  if (shouldRefreshNextRun('error') !== false) throw new Error('error must not refresh');
});

Deno.test('pickDailyAutomation prefers the active row over an earlier paused one', () => {
  const rows = [
    { id: 'old', status: 'paused' },
    { id: 'live', status: 'active' },
  ];
  if (pickDailyAutomation(rows)?.id !== 'live') {
    throw new Error('the active automation should represent the schedule');
  }
});

Deno.test('pickDailyAutomation falls back to the oldest row when all are paused', () => {
  const rows = [
    { id: 'oldest', status: 'paused' },
    { id: 'newer', status: 'paused' },
  ];
  if (pickDailyAutomation(rows)?.id !== 'oldest') {
    throw new Error('a paused account should still report its paused row');
  }
});

Deno.test('pickDailyAutomation returns null when nothing is provisioned', () => {
  if (pickDailyAutomation([]) !== null) {
    throw new Error('no rows means not provisioned');
  }
});
