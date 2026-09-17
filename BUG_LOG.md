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

**Validation:** 6 new regression tests in `apify-poll_test.ts` covering: attempt cap exceeded, wall-clock budget exceeded, normal waiting path increments counters, `TIMED-OUT` is terminal, missing run id fails fast, and `SUCCEEDED` still routes `true`. Deno is not installed on the Windows dev box, so the suite was not executed there — run `deno test --allow-all supabase/functions/_shared/workflow/` on the MacBook to confirm.

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

## BUG-004 — `PERSONAL PROJECTS` silently dropped from every tailored resume

**Status:** Fixed
**Feature:** Resume tailoring (AI generation contract + validation)

**Symptom:** Tailored resumes never contained the user's Personal Projects section. The section
was present in the master resume but absent from AI output, and no validation error was raised —
it simply vanished. A categorized SKILLS block (`Category:` headings with sub-bullets) was also
rejected outright as `skills_too_long`.

**Root Cause:** Three independent blockers in the generation/validation layer, none in the PDF
renderer where the symptom was first suspected.

1. **`PERSONAL PROJECTS` was not in `REQUIRED_HEADERS`.** This is the critical one, and it fails
   *silently rather than loudly*: `parseAtsSections` only recognizes headers on that list, so the
   `PERSONAL PROJECTS` line was treated as **body text inside `PROFESSIONAL EXPERIENCE`**, and
   `joinSections` re-emitted it that way. There was no "unknown section" error path — an
   unrecognized header is indistinguishable from a content line. `ATS_SYSTEM_PROMPT` separately
   instructed the model to use *exactly 7 headers*, so the model was also being told to drop it.
2. **The SKILLS line cap was 10.** The categorized format needs 16 lines (5 category headings +
   11 item lines), so `validateTwoPageShape` rejected it as `skills_too_long`. Measured against
   the user's real resume; the 2,500-char cap was never the binding constraint (actual: 688).
3. **`validateGrounding` had no `allowAggregate` for project lines.** Project titles and long
   `- Technologies: React 18, TypeScript, ...` lists are not verbatim source bullets, so they
   would have been rejected as `unsupported_source_line`. The existing exemption for
   `PROFESSIONAL EXPERIENCE` only covers **non-bullet** lines (company/date headers), which does
   not help here because project titles and technology lists *are* bullets in this format.

A latent fourth issue was resolved as a side effect: while `PERSONAL PROJECTS` was being absorbed
into `PROFESSIONAL EXPERIENCE`, `countExperienceAchievementBullets` counted all 13 project
bullets as experience bullets (risking `too_many_experience_bullets`), and `validateHumanVoice`
saw the 7 project bullets opening with "Built" as repeated-verb experience drift.

**Files:**
- `supabase/functions/_shared/ai/validate-resume.ts` — `PERSONAL PROJECTS` added to
  `REQUIRED_HEADERS` (between experience and certification) and `OPTIONAL_HEADERS`; `PROJECTS` /
  `KEY PROJECTS` / `SIDE PROJECTS` aliases; new `optionalHeaderSource()`; SKILLS line cap 10 → 24;
  `allowAggregate` extended to `PERSONAL PROJECTS`
- `supabase/functions/_shared/career-corpus/prompt.ts` — `ATS_SYSTEM_PROMPT` rewritten to the
  8-section contract with explicit per-section sub-shapes and a matching `OUTPUT SKELETON`;
  stale "7-section" references fixed in `HUMANIZE_RETRY_PROMPT`, `groundingRetryPrompt`, and
  `buildGroqResumeUserPrompt`
- `supabase/functions/_shared/ai/errors_test.ts`, `router_test.ts` — regression tests

**Fix:**
1. **`PERSONAL PROJECTS` became a real header.** Inserting it into `REQUIRED_HEADERS` was
   sufficient for ordering, because that one constant drives `canonicalHeader`,
   `countRequiredHeaders`, `joinSections`, `dedupeSectionLines`, and `dropUnsupportedContentLine`.
2. **Optional-header check generalized.** The bypass was hardwired to `certificationSource`
   (`if (OPTIONAL_HEADERS.has(header) && !options?.certificationSource?.trim())`), which would
   have rejected any resume without projects as `missing_ats_section`. Replaced with a per-header
   `optionalHeaderSource()` lookup: `CERTIFICATION` keeps its behavior, `PERSONAL PROJECTS` has no
   source option and so may always be absent.
3. **SKILLS line cap raised to 24**, leaving the 2,500-char cap as the real bloat guard.
4. **Prompt now specifies sub-shapes**, not just header names: `Category:` + `- ` items for
   SKILLS, `COMPANY | Role` + `Dates | Location` for experience, plain title + `- Technologies:`
   + bullets for projects, and `- ` bullets for certification and education. Project titles are
   standardized **unasterisked** (the source text was inconsistent) since the contract mandates
   plain text.

**Validation:** 43 tests pass / 0 fail across `_shared/ai/errors_test.ts` and all three
`_shared/career-corpus/` suites, including 6 new cases: 8-header order, the
`PROJECTS`/`KEY PROJECTS`/`SIDE PROJECTS` aliases, the full categorized resume round-trip,
`PERSONAL PROJECTS` surviving `canonicalizeAtsResumeOutput` as its own section, project bullets
staying out of the experience budget, and the optional-header regression (no projects still
validates). `npm run typecheck` clean.

Deno is not installed on the Windows dev box, so those suites were executed under Node via a
temporary `Deno.test` shim. `_shared/ai/router_test.ts` could **not** be executed that way —
`_shared/supabase-admin.ts` imports `https://esm.sh/@supabase/supabase-js`, which Node's loader
rejects. Its new eight-section fixture was instead verified by calling `validateResumeOutput`
with the exact option set `applyResumeValidation` passes. **Run
`deno test --allow-all --no-check supabase/functions/_shared/ai/` on the MacBook to confirm the
router path.**
`npm run lint` could not be completed — it hung at 0% CPU after 0.78s of work on two attempts,
including unsandboxed (the same way `tsc` hung before being run outside the sandbox).

**Deliberately out of scope:** the PDF renderer in `resume-latex.ts` was left untouched by the
user's explicit choice. Known open defects there: company header lines truncate at 72 chars,
`Dates | Location` lines are silently dropped, repeated project titles duplicate, and EDUCATION
renders a literal `-` prefix. A valid contract does **not** imply a correct PDF.

---

## BUG-005 — `repairTailorPipelineGraph` was a latent re-run of BUG-003

**Status:** Fixed
**Feature:** Resume tailoring (built-in `Resume Tailoring` graph provisioning / repair)

**Symptom:** None yet — found by audit, not by failure. The defect was **latent**: unreachable
while the tailor seed stayed stable, and guaranteed to fire the moment any tailor node was
renamed. This is the same posture BUG-003 had before `d5f3cf3c` made it detonate.

**Root Cause:** `repairTailorPipelineGraph` violated three of the workflow guardrails at once,
on the `Resume Tailoring` graph rather than the job-search graph the guardrails were written for:

1. **Gated on the target shape, not the source shape.** The check was literally "are all four
   desired node names present?" (`hasAll`). Per the guardrail, such a check re-fires forever the
   next time the desired shape changes.
2. **Matched nodes by display name.** `required = ['ATS Optimizer','Build LaTeX','Compile PDF',
   'Upload to Storage']` compared against `n.name`. Names have drifted before
   (`Get Resume` → `Sync Google Doc Resume`), so any rename makes the check fail permanently.
3. **Called `saveGraph()` from a repair path** via `provisionTailorGraph` — the destructive
   delete-all-nodes / delete-all-edges / insert-all rewrite that caused BUG-003.

It also lacked the **in-flight promise guard** that was part of the BUG-003 fix, even though
`ensureTailorPipeline` has two callers: `BootstrapService` on every login (`index.ts:2546`) and
the tailoring action itself (`index.ts:806`).

The failure mode would have differed from BUG-003 in one way: `provisionTailorGraph` mints fresh
`crypto.randomUUID()` ids per call, so there is no `23505` primary-key collision to make the
problem loud. Instead two concurrent callers interleave as delete/delete/insert/insert and leave
**two disconnected 5-node chains**. Since `getEntryNodes()` treats any node with no incoming edge
as an entry node, the tailor run would execute stray start nodes in arbitrary order — the silent
scrambled-order symptom from BUG-003 Follow-up 1, with no error surfaced. At 5 nodes / 4 edges the
`57014` statement timeout was unlikely, removing the other loud signal.

**Files:**
- `src/services/index.ts` — `repairTailorPipelineGraph` rewritten to plan a delta via
  `planPipelineRepair`; new `applyPipelineRepairPlan` helper extracted and shared with
  `repairDefaultPipelineGraph`; `ensureTailorPipeline` split into a guarded wrapper +
  `ensureTailorPipelineImpl` with a new `ensureTailorPipelineInFlight` field
- `supabase/functions/_shared/workflow/tailor-pipeline-repair_test.ts` (new) — 10 tests

**Fix:**
1. **Delta-based repair.** The tailor graph now goes through the same pure planner as the
   job-search graph. `saveGraph` is no longer reachable from any repair path; it remains only in
   `provisionTailorGraph`, which is called *only* when creating a brand-new workflow.
2. **Signature matching.** `planPipelineRepair` pass 1 keys on `type` + `action`/`builtin`, so a
   renamed tailor node is matched, not deleted and re-created. Verified: all 5 tailor seed nodes
   have unique signatures (`supabase` `load_job`, `gemini`, `function` `build_latex`, `pdf`,
   `storage`), so pass 1 alone resolves the whole graph.
3. **Convergence.** Applying a plan twice is a no-op, so the repair cannot loop.
4. **Concurrency collapsed.** `ensureTailorPipeline` now shares a single in-flight promise, the
   same pattern as `ensureDefaultPipeline`, so bootstrap + tailor action + React double-mount no
   longer race.

**Validation:** 10 new tests in `tailor-pipeline-repair_test.ts` covering: seed shape (5 nodes /
4 edges), signature uniqueness, healthy graph is a no-op, **a renamed node is matched not
re-inserted** (the exact regression), an edge-less graph is rewired without deleting nodes, a
missing node is restored with both its edges, exactly one entry node with every node reachable
after repair, convergence on a second pass, user-added nodes preserved, and stale-edge removal.
Full run: **107 passed / 0 failed** across 12 suites (all of `_shared/workflow/` plus
`src/utils/`). `npm run typecheck` clean, `npm run build` passes, `npx eslint` clean on the
changed files.

Deno is not installed on the Windows dev box, so suites ran under Node via a `Deno.test` shim
(`scripts/run-deno-tests.mjs`). `_shared/workflow/apify-poll_test.ts` cannot run that way — it
transitively imports `https://esm.sh/@supabase/supabase-js` through `supabase-admin.ts`, which
Node's loader rejects. It is untouched by this change. **Deno is installed on the MacBook — run
`deno test --allow-all --no-check supabase/functions/_shared/workflow/` there to confirm the full
suite.**

**Remaining risk:** No end-to-end run of the tailoring pipeline was performed against the new
repair path. The first `ensureTailorPipeline` call after this change will, for graphs that drifted,
write a delta rather than a rewrite — expected to be a no-op for healthy graphs.

---

## BUG-006 — A failed fetch rendered as "you have no data"

**Status:** Fixed
**Feature:** Data-loading states across Job Discovery, Executions, Resumes, Corpus,
Applications, Cover Letters

**Symptom:** When a list query failed, pages showed their **empty state** — e.g. Job Discovery
rendered *"No jobs found — Run a search to discover jobs, or check that jobs in Supabase belong
to your signed-in user."* The user was told their data did not exist when it had merely failed
to load. On `JobsPage` and `ExecutionsPage` a thin error banner *also* rendered, so the screen
simultaneously reported an error and an empty result set. On the other four pages the error was
not surfaced at all beyond a transient toast.

**Root Cause:** Two compounding gaps.

1. **No error branch in the render tree.** Pages branched only `isLoading → empty → content`.
   Since a failed TanStack query leaves `data` as `undefined`, control fell through to the
   `!data || data.length === 0` empty-state arm. `JobsPage` and `ExecutionsPage` captured
   `error` but rendered it as a *sibling* banner rather than as a branch, so both appeared.
   `ApplicationsPage`, `CorpusPage`, `ResumesPage`, and `CoverLettersPage` did not destructure
   `error` at all.
2. **No `ErrorBoundary` anywhere in the app** (0 occurrences), so any render-phase throw
   white-screened the whole SPA.

Contributing: all 151 error paths reported through `toast`, which disappears after a few
seconds and leaves an authoritative-looking but incorrect screen behind.

**Files:**
- `src/components/shared/ErrorState.tsx` (new) — `role="alert"`, readable message extraction
  from `unknown`, optional retry
- `src/components/shared/ErrorBoundary.tsx` (new) — class component; `resetKey` clears the
  fallback on navigation
- `src/layouts/AppLayout.tsx` — boundary inside `<main>`, keyed on `location.pathname`
- `src/App.tsx` — outer boundary around `<Routes>`
- `src/pages/JobsPage.tsx`, `ExecutionsPage.tsx`, `ResumesPage.tsx`, `CorpusPage.tsx`,
  `ApplicationsPage.tsx`, `CoverLettersPage.tsx` — `error`/`refetch` destructured; explicit
  error branch before the empty branch
- `src/components/motion/FadeIn.tsx` — see "latent bugs" below

**Fix:** Every data region now branches `isLoading → error → empty → content`. The error arm
renders `ErrorState` with the real message and a retry that calls `refetch()`. The sibling
banners were removed so a failure produces exactly one piece of UI.

`ErrorBoundary` is mounted at two levels: inside `AppLayout`'s `<main>` keyed on `pathname`,
so a page crash leaves the sidebar/topbar usable and navigating away clears the fallback; and
around `<Routes>` in `App.tsx`, which covers `AuthPage` and `AppLayout`'s own chrome.

**Two latent bugs found in `FadeIn` while wiring this:**
- Its reduced-motion branch returned a hardcoded `<div>`, silently discarding `as`. Every
  reduced-motion user therefore lost the `<header>` landmark that `PageHeader` requests.
- It accepted no pass-through props, so `ErrorState`'s `role="alert"` would have been dropped.

**Validation:** `npm run typecheck` clean; `npm run build` passes; 39 tests pass under the Node
shim (`pipeline-repair`, `tailor-pipeline-repair`, `job-kanban`); `npx eslint` clean on all
changed files with no new problems. **Not verified in a browser** — no browser automation is
available in the agent environment, so the boundary's fallback UI and each error branch are
unexercised at runtime. The `ErrorBoundary` catches render-phase throws only; async rejections
and event-handler errors still rely on local `toast` handling.

---

## BUG-007 — Page-header buttons were unreachable on mobile

**Status:** Fixed
**Feature:** Page headers on Job Discovery and Resumes

**Symptom:** On a phone, the buttons at the top of Job Discovery and Resumes were missing.
Reported by the user; `Run Search` (Job Discovery) and `New Resume` (Resumes) — the primary
action on each page — were among the ones that disappeared.

**Root Cause:** `PageHeader` wraps its `actions` slot in a `flex-wrap` container, but both
pages passed **their own** `<div className="flex gap-2">` inside it, which reset wrapping for
their children. Five buttons on one non-wrapping line is wider than a 320px viewport, and
`AppLayout`'s `<main>` carries `overflow-x-hidden` — so the overflow was **clipped rather than
scrollable**. The buttons were not cramped, they were *unreachable*: no scroll affordance, no
wrap, no menu.

A repo-wide grep for the pattern found exactly two occurrences — `JobsPage.tsx:278` and
`ResumesPage.tsx:129` — matching the two pages reported, which confirmed the diagnosis
independently.

**Files:**
- `src/components/shared/HeaderActions.tsx` (new)
- `src/pages/JobsPage.tsx` — 5 buttons → `HeaderActions` (primary `Run Search`)
- `src/pages/ResumesPage.tsx` — 3 buttons → `HeaderActions` (primary `New Resume`); the
  `New Resume` `Dialog` was detached from its `DialogTrigger` and moved into the page body
  (it is already fully controlled by `showCreate`, so this is behaviour-neutral)

**Fix:** `HeaderActions` keeps the primary action visible at every width and collapses
secondary actions into an overflow menu below `sm`, rendering them inline (and `flex-wrap`) at
`sm` and up. Plain wrapping was rejected as the fix because five buttons would stack into three
rows above the page content.

**Validation:** `npm run typecheck` clean; `npm run build` passes; `npx eslint` clean on the
changed files; 29 tests pass under the Node shim. Grep confirms zero remaining
`className="flex gap-2"` action rows under `src/pages/`. **Not verified in a browser** — the
320px behaviour, the overflow menu, and the detached dialog need manual confirmation.

---

## Audit findings — UI production-readiness (2026-09-17)

A full audit against `.cursor/skills/motion-design` and
`.cursor/skills/frontend-ui-engineering`. The visual layer was already sound — **0** raw hex
colours, 3 `shadow-*`, 1 `bg-gradient-to`, 39 skeleton states, 23 `htmlFor` bindings, 45
`focus-visible` — so none of the classic "AI aesthetic" markers applied. What read as
unfinished was *behaviour*. Fixed in four phases; phase 5 (splitting `JobsPage.tsx` — 1056
lines when audited, **1073 now** after the phase-1/3 edits landed in it — and sweeping ~75
arbitrary bracket values) was **explicitly deferred by the user**.

| Finding | Severity | Resolution |
|---|---|---|
| Nothing in the app responded to a click: **1** `active:` state and **0** `whileTap` against **64** `hover:` states. Hover-only interactivity is the strongest "mockup" tell. | Critical | `:active` press rule added to `src/index.css` (not `ui/button.tsx`, which is shadcn-generated). Written unlayered so it outranks `transition-colors`; scoped to `button` only so it does not compound with framer's `pressable` on clickable cards. |
| `staggerChildren` was uncapped on unbounded server lists — 20 rows = 800ms, 50 rows = **2000ms** against a 500ms budget. | Critical | `StaggerList` injects a positional index; `staggerItem` clamps it to `MAX_STAGGER_INDEX = 8`. |
| `collapseVariants` animated `height: 0 → 'auto'`, triggering layout every frame. | Critical | Rewritten to `scaleY` + `transformOrigin: top`. **Callers must add `overflow-hidden`** — documented in the JSDoc. |
| Failed fetches rendered as empty states; no `ErrorBoundary`. | Critical | See BUG-006. |
| `useReducedMotion()` matched `(max-width: 1023px)` as well as the media preference, so **every phone and tablet got zero animation**, including press feedback. A perf shortcut paid for with a dead-feeling app on the majority form factor. | High | Split: `useReducedMotion()` is now preference-only; the viewport clause moved to `useHeavyMotionEnabled()`, used solely by `ScanLineBackground`. |
| `EASE_OUT` was the only curve, so exits decelerated instead of accelerating. | High | `EASE_IN` + `transitionExit` added; exits are now shorter than entrances. |
| `DURATION.base` was 0.45s — modal-weight timing on list rows. | High | 0.45 → 0.28, inside the 200–350ms card band. |
| Heading levels jumped h1 → h3 (`PageHeader` h1, `CardTitle` h3, no h2 tier). | High | `SectionHeading` (h2) added to `PageHeader.tsx`. |
| Lists were `div`s: `StaggerList` supported `as="ul"` but was never called with it; **1** `role=` in the whole app. | High | 9 record collections converted to `ul`/`li` with `label`. Metric grids left as `div`s. Clickable `StaggerItem`s now get `role="button"`, `tabIndex`, and Enter/Space handling. |
| Only one motion layer existed (opacity + `y:8`), with no secondary layer or follow-through. | Medium | Entrances gained a resolving 2px blur alongside the lift. |
| **No webfont was loaded at all.** No `<link>`, no `@import`, no `fontFamily` in `tailwind.config.js` — and `index.css` set `font-feature-settings: "cv11","ss01"` plus `font-variation-settings: "opsz" 32`, which are Inter-specific and therefore inert. Something intended Inter and it never shipped. | Medium | Inter Tight + JetBrains Mono loaded with `preconnect`/`display=swap`, registered in `tailwind.config.js`, `font-sans` applied to `body`; dead feature settings replaced with Inter Tight's real axes (`cv05`, `cv08`) and `opsz` dropped. |
| `grid-cols-2` with no responsive prefix in 3 places. | Medium | Only `ApplicationsPage`'s Applied/Recruiter pair actually needed stacking (long recruiter names / dates). `AuthPage`'s two OAuth buttons and `DashboardPage`'s two stat labels are short enough at 320px that stacking would be worse — **left alone deliberately**. |
| Dashboard `Execution Queue` / `Recent Activity` not responsive: `CardHeader` forced `flex-row` unconditionally (title collided with "View all" at 320px); run rows put icon + name + badge on one line; `ScrollArea` was a hard `h-[240px]`, reserving dead space on phones. | Medium | Header stacks until `sm`; badge drops below the text on mobile; `ScrollArea` is `max-h-[240px]` on mobile and fixed from `lg`. |
| Settings had 6 tab triggers in a horizontal scroller — the hidden ones were easy to miss at 320px. | Medium (user request) | New `SETTINGS_TABS` constant drives everything; first two inline on mobile, remaining four behind a hamburger, all six inline from `sm`. The trigger **names the active hidden section** so the user can tell where they are when both visible tabs look inactive. Also fixed a latent bug: the inline `onValueChange` meant the new menu would have bypassed the `?tab=` URL sync — both paths now share `setSettingsTab`, keeping tabs deep-linkable. |

**Corrections to the audit's own figures.** Two findings were over-reported by line-scoped
greps and are recorded here so the numbers are not trusted later:

- *"18 unlabeled icon-only buttons"* — actually **1** (the sidebar collapse toggle, now fixed
  with `aria-label` + `aria-expanded`). `aria-label` almost always sits on the line *after*
  `size="icon"`, so a per-line match missed it. A whole-element walk found every other one
  already labelled.
- *"3 non-responsive grids"* — actually **1** worth changing, as above.

**Deliberately out of scope (phase 5):** `src/pages/JobsPage.tsx` is **1073 lines** (5x the
skill's 200-line red flag; it was 1056 when audited and grew as phases 1 and 3 landed in it),
and ~75 arbitrary `[...]` bracket values remain off the spacing and type scales.

---

## Audit findings — documentation drift (2026-09-17)

Recorded for traceability; all were corrected in the same pass.

| Finding | Resolution |
|---|---|
| `AGENTS.md` and `RESTORE_POINTS.md` claimed local `git` was available at 2.39.5; a mid-audit correction then over-corrected to "not installed on Windows". Both were wrong. `git` **is** installed on both machines — it is simply not always on `PATH` in a fresh Windows shell, which is why `where.exe git` found nothing. | Both files corrected to state git is available on both machines, with a note to locate the binary rather than conclude it is missing when `PATH` lookup fails. The public-repo fallback (`raw.githubusercontent.com` / GitHub API) is retained for shells without git on `PATH`. |
| **Auto-apply was entirely undocumented** despite sending real email to employers via the user's Gmail account. | Added to `docs/FEATURE_MAP.md` with a warning callout, plus an `AGENTS.md` Key Files row. |
| Interview prep entirely undocumented (backend mode in `resume-actions`, two UI surfaces, `jobs.interview_prep`). | Added to `docs/FEATURE_MAP.md` + Key Files. |
| Guardrail "match by `type`+`action`, **never** by display name" was false — `planPipelineRepair` has a deliberate pass-2 name fallback. | Reworded to "never by display name *alone*", documenting all three passes. |
| Guardrail "`Match Score` must stay **first** in the fan-out" contradicted the documented fan-out start (`Store Job`). `Match Score` is `chain[1]`. | Reworded to "first *scoring* step, immediately after `Store Job`". |
| Two migrations share the prefix `023` (`023_interview_prep.sql`, `023_scheduled_run_slots.sql`) — likely why interview prep slipped out of the docs. | Left as-is (both apply lexicographically); noted in `FEATURE_MAP.md` with "do not add a third `023`". |
| `DEFAULT_RESUME_TAILOR_WORKFLOW` (a second built-in seed graph) was unlisted. | Documented under Workflow Engine. |
| Dead code: `PasteJdDialog.tsx` (defined, never imported) and 6 service classes with zero call sites (`AgentService`, `PromptService`, `EmailService`, `PDFService`, `StorageService`, `AIService`) plus `EdgeAIProvider`, the `AIProvider` interface, and the now-orphaned `mapAgent`/`mapPrompt` helpers. | Deleted. `docs/FEATURE_MAP.md`, `docs/features/job-discovery.md`, and `docs/features/ai-copilot.md` updated; `ApplicationPackageWizard` re-described as the 4-step wizard it actually is. |
| `REQUIRED_HEADERS` is cited in `AGENTS.md` as the source of section order but is **not exported** from `validate-resume.ts`. | Noted only — not changed, as exporting it is outside the audit scope. |
| **Two-machine hazard:** no `.gitattributes`, `core.autocrlf` unset, and all 124 files under `src/` are CRLF. Editing the same file on both the Windows box and the MacBook produces whole-file phantom diffs. | Documented in `AGENTS.md` → Development Environments and `RESTORE_POINTS.md`. **Not fixed** — `* text=auto eol=lf` forces a one-time renormalization commit touching nearly every file, which should be its own deliberate commit made on the Mac. |

---
