/**
 * Provisioning decisions for the built-in daily job search automation.
 *
 * These are pure so the login-time repair path can be tested. The repair itself
 * lives in `WorkflowService.repairDefaultAutomation`, which runs on *every*
 * login — meaning a wrong decision here does not merely fail once, it re-fires
 * every time the user opens the app.
 */

/** The subset of an `automations` row these decisions depend on. */
export interface AutomationSibling {
  id: string;
  workflow_id: string;
  status: string;
}

/**
 * Whether login-time repair should insert a fresh `active` automation.
 *
 * Returns false when *any* sibling automation already exists, whether active or
 * paused. The paused case is the load-bearing one: the user turning the daily
 * run off leaves a paused row behind, and re-inserting an active row because
 * this particular workflow id happens to lack one would silently restart the
 * schedule they just disabled.
 *
 * @param siblings every automation across the duplicate-named job-search workflows
 * @param hasOwnRow whether the workflow being repaired already has its own row
 */
export function shouldProvisionDailyAutomation(
  siblings: readonly AutomationSibling[],
  hasOwnRow: boolean,
): boolean {
  if (hasOwnRow) return false;
  return !siblings.some((row) => row.status === 'active' || row.status === 'paused');
}

/**
 * Whether login-time repair may rewrite an existing automation's `next_run`.
 *
 * Only active automations are touched. Refreshing `next_run` on a paused row
 * would be harmless today but would make the pause look like a live schedule in
 * any UI that reads `next_run`.
 */
export function shouldRefreshNextRun(status: string): boolean {
  return status === 'active';
}

/**
 * The automation that represents the daily run for display purposes.
 *
 * Prefers an active row so the UI reflects "on" whenever anything is actually
 * scheduled, and otherwise falls back to the oldest row so a fully paused
 * account still shows its real paused state rather than "not provisioned".
 */
export function pickDailyAutomation<T extends { status: string }>(
  rows: readonly T[],
): T | null {
  if (!rows.length) return null;
  return rows.find((row) => row.status === 'active') || rows[0];
}
