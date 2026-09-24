/**
 * Shared authentication for the internal scheduler endpoints
 * (`workflow-scheduler`, `workflow-step`).
 *
 * These endpoints are not user-facing: they drive the **global** step queue and
 * automation sweep across every tenant, so an unauthenticated caller can force
 * AI spend, Apify scrapes and outbound auto-apply email on behalf of all users.
 *
 * The check lived inline in both functions and was written `if (secret && ...)`,
 * which **failed open** — with `WORKFLOW_SCHEDULER_SECRET` unset the guard was
 * skipped entirely and the endpoint was fully anonymous. `003_cron.sql` makes
 * an unset secret a realistic deployment state, since the operator has to
 * substitute it by hand.
 *
 * It lives here rather than inline so the two endpoints cannot drift, and so
 * there is exactly one place to audit. `careerpilot-doc-sync` already had the
 * correct shape; this generalizes it.
 */
import { jsonResponse } from './supabase-admin.ts';

/**
 * Returns `null` when the caller is authorized, or the `Response` to return
 * when it is not.
 *
 * A missing secret is reported distinctly from a wrong one: both refuse the
 * request, but 503 tells an operator the deployment is misconfigured instead of
 * letting a silently-dead scheduler look like "no automations are due".
 */
export function checkSchedulerAuth(req: Request): Response | null {
  const secret = Deno.env.get('WORKFLOW_SCHEDULER_SECRET');
  if (!secret) {
    return jsonResponse(
      { error: 'WORKFLOW_SCHEDULER_SECRET is not configured; refusing to run unauthenticated' },
      503,
    );
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  return null;
}
