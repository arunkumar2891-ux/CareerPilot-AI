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

## BUG-003 — Job search fails with `workflow_nodes_pkey` duplicate key and statement timeout

**Status:** Fixed
**Feature:** Job search pipeline (built-in graph provisioning / repair)

**Symptom:** Clicking Run Search on the Jobs page surfaced two errors:
`{"code":"23505","message":"duplicate key value violates unique constraint \"workflow_nodes_pkey\""}`
and `{"code":"57014","message":"canceling statement due to statement timeout"}`.

**Root Cause:** A latent hazard dating to `d5f3cf3c`, detonated by moving `Match Score` after
`ATS Optimizer`. `repairDefaultPipelineGraph()` reordered the chain by calling `saveGraph()`,
which is a destructive full-graph rewrite: `DELETE` all `workflow_edges`, `DELETE` all
`workflow_nodes`, then re-`INSERT` every node with the *same* primary keys (ids are preserved
when they are UUIDs).

Before `d5f3cf3c` the repair was a one-shot legacy migration, gated on the presence of the *old*
shape — `if (!wf.edges.some((e) => e.source === dedupe.id && e.target === ats.id)) return;`.
Once repaired that edge no longer exists, so the function became a permanent no-op and the
destructive `saveGraph()` path was effectively unreachable. `d5f3cf3c` replaced that precondition
with a convergence check (`alreadyRepaired && nodes.length === wf.nodes.length`), which is safe
only while the desired chain never changes. Changing the chain made it fire on every call.
Lesson: gate a graph migration on the *source* shape it migrates from, not on the target shape.

Three compounding gaps:

1. **The repair ran on every job search.** `JobsPage.runSearch()` calls
   `ensureDefaultPipeline()` -> `repairDefaultPipelineGraph()`. Because the desired chain had
   changed, the "already repaired" early-return no longer matched, so the full rewrite fired on
   every invocation instead of once.
2. **Concurrent callers raced on the same rows.** Bootstrap also calls `ensureDefaultPipeline()`.
   Two overlapping rewrites interleaved as delete/delete/insert/insert; both computed identical
   node ids, so the second `INSERT` collided -> `23505`. Lock contention between the two
   delete-all statements produced `57014`.
3. **`saveGraph` ignored its `DELETE` errors.** The two deletes were awaited without checking
   `error`, so a timed-out delete fell through to the insert and surfaced as a misleading
   duplicate-key error rather than the real cause. Worse, the edge delete had already committed,
   so a throwing node insert left the workflow with **zero edges** — an inert pipeline.

**Files:**
- `src/services/index.ts` — `repairDefaultPipelineGraph()` rewritten to do targeted writes instead
  of `saveGraph()`; `ensureDefaultPipeline()` wrapped in an in-flight promise guard;
  `saveGraph()` now checks both delete errors
- `supabase/migrations/027_workflow_edges_unique.sql` — dedupes `workflow_edges` and adds a unique
  index on `(workflow_id, source_id, target_id, COALESCE(label,''))`

**Fix:**
1. **No more full-graph rewrite.** The repair rebuilds the seed topology by matching nodes on
   name, then writes only the delta: delete stale edge rows by id, insert missing edge rows.
   `workflow_nodes` is never deleted, so the PK collision is structurally impossible and the
   statements are small enough not to time out. Edges touching user-added nodes are left alone.
2. **Recovers wiped graphs.** Because the desired edge set is derived from `buildSeedEdges()`
   rather than a hardcoded six-edge chain, a graph left edge-less by the half-applied
   `saveGraph` is fully restored on the next load.
3. **Concurrency collapsed.** `ensureDefaultPipeline()` shares a single in-flight promise, so
   bootstrap plus JobsPage (and React double-mount in dev) no longer race. Residual cross-tab
   races are absorbed: `23505` on the node/edge inserts is treated as "someone else got there
   first", and the new unique index prevents duplicate links entirely.
4. **Duplicate links cannot fork the run.** A second outgoing edge between the same pair made
   the executor fan out twice down one branch. Migration 027 dedupes existing rows (keeping the
   oldest per group) and enforces uniqueness. Verified the seed has no legitimate duplicate
   `(source, target, label)` triples — the only fork, `Check Apify Status`, uses distinct targets.

**Validation:** `npm run typecheck` clean, `npm run build` passes, `npx eslint src/services/index.ts`
clean. `deno test` on `seed-graph_test.ts` + `run-batch_test.ts` — 14 passed / 0 failed.
Migration 027 must be applied in Supabase before the next run.

**Follow-up (same bug, second symptom):** The user's graph rendered with steps in impossible order
(`Parse Jobs` before `Fetch Results` before `Start Apify Scrape`) and no per-job fan-out or fan-in.
This is the downstream effect of the edge-less graph left by the half-applied `saveGraph`:
`getEntryNodes()` treats any node without an incoming edge as an entry node, so with zero edges
**every** node became a start node and ran once in arbitrary row order with nothing piped between
them. No jobs were stored, so `jobExecutions` was empty, so `buildExecutionGraph` produced no
`jobBranches` (fan-out) and no `fanInNodes`.

A second latent defect was found while fixing it: the repair matched nodes **by name**, but the
user's graph had a legacy `gdocs` node named `Get Resume` while the seed calls it
`Sync Google Doc Resume`. Name matching would silently never resolve it, permanently leaving edges
`0→1` and `1→2` missing.

Additional changes:
- `src/utils/pipeline-repair.ts` (new) — pure planner, `planPipelineRepair()`. Matches nodes by
  `type` + `action`/`builtin` signature (3 passes: signature, then exact name, then sole node of
  that type), restores missing **nodes** as well as edges, realigns drifted positions (positionX
  drives the prefix / per-job / fan-in split in `execution-graph.ts`), and returns a minimal delta.
- `supabase/functions/_shared/workflow/pipeline-repair_test.ts` (new) — 11 tests including the exact
  reported state (nodes present, zero edges), the `Get Resume` rename, stale-edge removal, no
  accidental fork, user-added nodes preserved, and convergence (applying the plan twice is a no-op).
- `supabase/functions/_shared/workflow/nodes.ts` — fixed 2 type errors introduced by the earlier
  `match_score` rewrite: `output` needed an explicit `Record<string, unknown>[]` annotation or
  `single.jobId` / `single.id` were not typed, risking the score never being persisted.

**Follow-up validation:** 11 new tests pass; full workflow suite 71 passed / 0 failed;
`npm run typecheck` clean; `npm run build` passes; lint unchanged at 38 pre-existing problems.
`deno check` errors dropped 8 → 6; the remaining 6 were verified to exist identically on
`origin/main` (`resume-drive.ts:51`, `execution-persistence.ts:426`, `nodes.ts:725/994/999/1013`)
and are out of scope.

**Follow-up 2 — the graph was never migrated from an Aug-22 seed.** A screenshot of the working
execution graph revealed two nodes that exist in *no* current code path: `Get Resume` and
`Upload to Drive`. Walking the history of `src/constants/workflow-seed.ts` on GitHub placed the
user's DB graph at the **Aug-22 seed (`4f3363e7`)** — 19 nodes, chain order
`Limit → Dedupe → ATS → Store`, and a `gdrive` "Upload to Drive" step that was deliberately
removed in `5d682c32` ("Drive sync is manual"). The `gdocs` step was later renamed
`Get Resume` → `Sync Google Doc Resume`.

This mattered because the repair reconciles against the *current* 18-node seed. `Upload to Drive`
is not in it, so it would have been treated as user-added and left **orphaned** — and an orphan has
no incoming edge, so `getEntryNodes()` would have run it as a stray start node, reproducing the
original scrambled-order symptom. Confirmed with the user: drop the retired Drive node, keep the
current dedupe-before-limit order, leave the `Get Resume` name alone.

Additional changes:
- `src/utils/pipeline-repair.ts` — added `RETIRED_SEED_SIGNATURES` (`gdrive#action:upload`) and
  `deleteNodeIds` to the plan. Retired nodes are excluded before matching so they can never be
  claimed or rewired; edges touching them are always deleted, and a deleted-but-existing edge no
  longer suppresses a needed insert. Only signatures on that list are ever deleted — a user-added
  `gdrive` node with `action: download` is preserved.
- `src/services/index.ts` — executes `deleteNodeIds` *after* `deleteEdgeIds` so no foreign key
  can dangle.
- `supabase/functions/_shared/workflow/pipeline-repair_test.ts` — grew to 18 tests, including a
  faithful reconstruction of the 19-node Aug-22 graph both edge-less and with its original edges,
  a reachability test (every seed node reachable from the trigger — the direct regression test for
  the scrambled order), a convergence test, and two rendering-contract tests asserting the per-job
  fan-out is exactly
  `Store Job → ATS Optimizer → Match Score → Build LaTeX → Compile PDF → Upload to Storage`
  and that neither `ATS Optimizer` nor `Match Score` leaks into the shared prefix.

**Follow-up 2 validation:** 18 pipeline-repair tests pass; full workflow suite **78 passed / 0
failed**; `npm run typecheck` clean; `npm run build` passes; `eslint` clean on all three changed
files with the repo total unchanged at 38 pre-existing problems.

---
