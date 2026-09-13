# Bug Log

Record resolved bugs here for future reference. Use the format below.

---

## Template

```
## BUG-XXX — [Short title]

**Status:** Fixed / Open / Investigating
**Feature:** [feature name]

**Symptom:** [what happened]
**Root Cause:** [why it happened]

**Files:**
- `path/to/file`

**Fix:** [short description]
**Validation:** [tests/manual validation performed]
```

---

## BUG-001 — Scheduled run fails with "Unexpected token '<', "<html> <h"... is not valid JSON"

**Status:** Fixed
**Feature:** Job search pipeline (Apify scraping)

**Symptom:** Scheduled daily run failed with `Unexpected token '<', "<html> <h"... is not valid JSON`. "Check Apify Status" appeared as the last successful node; no node-level error visible in UI or Supabase logs.

**Root Cause:** All three Apify API calls in the workflow `apify` node (`start_run`, `check_status`, `fetch_dataset`) called `res.json()` on the raw fetch response without checking `res.ok`. When Apify/Cloudflare returns an HTML error page (transient 502/503, rate limit, maintenance), `res.json()` throws the cryptic JSON parse error. The executor records it only as the run-level `error_message`, so the failing node (a later `check_status` poll iteration, or `fetch_dataset`) is not obvious in the graph.

**Files:**
- `supabase/functions/_shared/fetch-timeout.ts` (added `fetchJsonChecked`)
- `supabase/functions/_shared/workflow/nodes.ts` (apify node: all 3 actions)
- `supabase/functions/_shared/fetch-timeout_test.ts` (new regression tests)

**Fix:**
1. New `fetchJsonChecked()` helper reads the body as text, checks `res.ok` first, and throws descriptive errors including HTTP status — detecting HTML error pages explicitly instead of leaking the JSON parse error.
2. `check_status` now treats transient failures (5xx, HTML pages, network) as "keep polling" (returns `waiting`) with a consecutive-failure counter (`ctx.variables.apifyPollErrors`) that gives up after 5; 4xx still fails fast.
3. `fetch_dataset` retries once after 2s on transient errors; 4xx fails immediately with a descriptive message.

**Validation:** 4 new regression tests in `fetch-timeout_test.ts` (HTML 502, non-JSON 200, JSON error body, valid JSON) — all pass. Full existing Deno suite passes (99 core/workflow + 58 ai/career-corpus). Note: `resume-parse_test.ts` has a pre-existing broken import (`../resume-parse.ts` should be `./resume-parse.ts`) and was excluded.

---

## BUG-002 — "Check Apify Status" polls forever on the first role

**Status:** Fixed
**Feature:** Job search pipeline (Apify scraping / role loop)

**Symptom:** For two consecutive runs, the `Check Apify Status` node for the first search role stayed in an infinite `waiting` → re-poll loop. The run never advanced to `Fetch Results`, never moved to the second role, and never failed — so it neither completed nor surfaced an error.

**Root Cause:** The `check_status` branch of the `apify` node had **no upper bound on the number of polls**. Its only exit paths were:
- `SUCCEEDED` → success
- `FAILED` / `ABORTED` → throw
- anything else → `status: 'waiting'` with `resumeAt = now + 10s`, unconditionally

Three gaps made that last branch a true infinite loop:

1. **No attempt/time cap.** Any non-terminal status (`READY`, `RUNNING`) re-queued the node forever. An Apify actor stuck in `RUNNING`, or one that never reaches a terminal state, loops indefinitely.
2. **`TIMED-OUT` was not treated as terminal.** Apify's real status string for exceeded runs is `TIMED-OUT` (hyphenated), which did not match the `'FAILED' || 'ABORTED'` check and therefore fell through to the `waiting` branch — polling a permanently dead run forever.
3. **The stale-run watchdog could not catch it.** `recoverStaleWorkflowState()` skips any run that still has a `pending` row in `workflow_step_queue` (`if (pendingStep?.id) continue;`). Because each `waiting` result inserts exactly such a row, the run always looked "alive" and was never failed out.

`apifyPollErrors` only guarded *fetch* failures (5xx/HTML/network), not successful responses reporting a non-terminal status — so it never applied here.

**Files:**
- `supabase/functions/_shared/workflow/nodes.ts` — added `APIFY_POLL_INTERVAL_MS`, `APIFY_POLL_MAX_ATTEMPTS` (120), `APIFY_POLL_MAX_WAIT_MS` (20 min), `APIFY_TERMINAL_FAILURE_STATUSES`; bounded `check_status`; reset poll state in `start_run`; guard for a missing `apifyRunId`
- `supabase/functions/_shared/workflow/role-loop.ts` — added `apifyPollErrors`, `apifyPollAttempts`, `apifyPollStartedAt` to `ROLE_RESET_KEYS`
- `supabase/functions/_shared/workflow/apify-poll_test.ts` — new regression tests

**Fix:**
1. **Attempt + wall-clock cap.** `check_status` now tracks `apifyPollAttempts` and `apifyPollStartedAt`. Exceeding 120 attempts or 20 minutes throws a descriptive error naming the run id, elapsed minutes, attempt count, and last observed status. The node fails cleanly, so the run is marked failed and the role loop can proceed instead of hanging.
2. **`TIMED-OUT` / `TIMED_OUT` now terminal.** Terminal statuses moved into `APIFY_TERMINAL_FAILURE_STATUSES` so a dead run fails fast rather than being polled.
3. **Poll state reset per role.** `start_run` zeroes `apifyPollErrors` / `apifyPollAttempts` and stamps `apifyPollStartedAt`; `ROLE_RESET_KEYS` clears all three when advancing roles, so role 2 is never poisoned by role 1's counters (and vice versa).
4. **Missing run id fails fast.** A missing `apifyRunId` previously produced a `.../runs/undefined?token=...` request; it now throws immediately.

**Validation:** 6 new regression tests in `apify-poll_test.ts` covering: attempt cap exceeded, wall-clock budget exceeded, normal waiting path increments counters, `TIMED-OUT` is terminal, missing run id fails fast, and `SUCCEEDED` still routes `true`. Deno is not installed on this machine, so the suite was not executed locally — run `deno test --allow-all supabase/functions/_shared/workflow/` to confirm.

---
