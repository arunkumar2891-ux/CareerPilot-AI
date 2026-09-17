# Restore Points

Known-good states you can return to. Each entry records what was verified, the exact
commands used to verify it, and what to do if you need to roll back. **Newest first.**

To restore, check out the tag (or commit) for the entry you want:

```bash
git checkout v1.3.0-match-gate-kanban   # once tags exist; see below
npm install
npm run build
```

> `git` is available on both dev machines (Windows and MacBook), so every snippet in this file
> works as written. An earlier revision claimed git was not installed on Windows; that was wrong —
> it is installed, just not always on `PATH` in a fresh shell. If `git` is not found, locate the
> binary rather than assuming it is missing.
>
> The repo is also public, so a file can be read at any commit without git:
> `https://raw.githubusercontent.com/arunkumar2891-ux/CareerPilot-AI/<ref>/<path>`.
>
> ### Tags still do not exist
>
> Commits exist; only the tags are missing, so `git checkout v1.3.0-...` will fail until they are
> created. Until then, find a state with `git log` by the `package.json` version in that commit.
>
> ```bash
> git tag -a v1.3.0-match-gate-kanban <commit> -m "Verified working: match-score gate (>80), kanban drag-and-drop"
> git tag -a v1.2.0-stable-pipeline   <commit> -m "Verified working: batched per-role runs + self-healing graph"
> git push --tags
> ```
>
> ### ⚠️ Line endings are not normalized
>
> There is no `.gitattributes`, `core.autocrlf` is unset, and all 124 files under `src/` are
> currently CRLF. Editing the same file on both machines produces whole-file phantom diffs that
> can bury a real change and make `git checkout <commit> -- <path>` rollbacks noisy. Fixing it
> (`.gitattributes` with `* text=auto eol=lf`) costs a one-time renormalization commit touching
> nearly every file — do it as its own commit.

---

## Uncommitted — brand/theme retheme + UI production-readiness pass (2026-09-17)

### What this is

Not a restore point. Recorded so the work is discoverable before it is committed and tagged.

Two related bodies of work sit uncommitted on the Windows box:

1. **Brand + theme.** Forest-green retheme of `src/index.css` (light + dark), new plane
   `LogoMark`, new `LogoLockup` horizontal lockup, gradient tiles removed from 6 call sites,
   new `public/` brand assets, rewritten `index.html`, and the first webfont the app has ever
   loaded (Inter Tight + JetBrains Mono).
2. **UI production-readiness, phases 1–4.** Motion foundation (`src/lib/motion.ts`), global
   press feedback, `ErrorBoundary` + `ErrorState` wired into 6 pages, list/heading semantics,
   and three user-reported responsive fixes. Fully described in `BUG_LOG.md` → BUG-006,
   BUG-007, and the UI audit table.

### Why it is not a restore point yet

- **Nothing has been verified in a browser.** No browser-automation tooling exists in the
  agent environment, so every visual and interaction change is unverified at runtime. That
  includes the dark-mode palette, the press feel, the recovered mobile motion, the
  `ErrorBoundary` fallback, and all three responsive fixes.
- **The two suites that need Deno have not run** (`_shared/workflow/apify-poll_test.ts`,
  `_shared/ai/router_test.ts`). Both are untouched by this work, but the suite is not green
  by observation.
- Phase 5 was deliberately skipped: `src/pages/JobsPage.tsx` is still 1073 lines and ~75
  arbitrary bracket values remain.

### What was verified

```bash
npm run typecheck   # clean
npm run build       # passes
npx eslint <changed files>   # clean; repo total unchanged at 38 pre-existing
node --experimental-strip-types scripts/run-deno-tests.mjs <suites>   # 39 passed / 0 failed
```

### Before making this a restore point

1. Check the app by hand at **320px, 768px, 1024px, 1440px**, in both themes.
2. Confirm the `collapseVariants` change did not break any expander — it moved from `height`
   to `scaleY`, so a caller lacking `overflow-hidden` will briefly spill content.
3. Confirm the Dashboard status-badge indent (`pl-7`, hand-matched to the icon width) lines up.
4. Run the full Deno suites on the MacBook.
5. Then bump, commit as focused commits (brand/theme, then each UI phase), and tag.

---

## Pre-change anchor — before the 8-section resume AI contract

**Commit:** `1d5803d` ("classic template fix")
**Date:** 2026-09-16
**Status:** ⚠️ **Rollback anchor only — not a verified-good state.**

### What this is

The exact tree immediately before the resume AI contract was rewritten from 7 to 8 sections
(BUG-004). Recorded so that change can be reverted precisely; the contract work was still
uncommitted when this entry was written, so `1d5803d` *is* the pre-change state.

### Why it is not a restore point

Every other entry in this file was confirmed working in the running app. This one was not, and
should not be treated as a fallback target:

- The AI contract at `1d5803d` **cannot** emit `PERSONAL PROJECTS` at all — the section is
  silently absorbed into `PROFESSIONAL EXPERIENCE` (BUG-004). That is the defect, not a baseline.
- Categorized SKILLS is rejected as `skills_too_long` (cap was 10 lines, format needs 16).
- The PDF renderer defects that prompted the whole effort are present and unfixed.

Return here only to isolate whether a *new* problem came from the contract change. To recover
correct behavior, go forward, not back.

### Rollback

Code-only; no migration accompanied the contract change.

```bash
git checkout 1d5803d -- supabase/functions/_shared/ai/validate-resume.ts \
                        supabase/functions/_shared/career-corpus/prompt.ts
```

Then redeploy `workflow-run`, `workflow-step`, and `ai-chat` — the shared modules are bundled at
deploy time, so reverting the files alone changes nothing in production.

### What changed after this commit

| File | Change |
|------|--------|
| `supabase/functions/_shared/ai/validate-resume.ts` | `PERSONAL PROJECTS` in `REQUIRED_HEADERS` + `OPTIONAL_HEADERS`; project header aliases; `optionalHeaderSource()`; SKILLS line cap 10 → 24; `allowAggregate` for projects |
| `supabase/functions/_shared/career-corpus/prompt.ts` | 8-section `ATS_SYSTEM_PROMPT` with per-section sub-shapes; rewritten `OUTPUT SKELETON`; stale 7-section references fixed |
| `supabase/functions/_shared/ai/errors_test.ts` | 5 new regression cases |
| `supabase/functions/_shared/ai/router_test.ts` | Eight-section fixture + pass-through test |

### Verification performed on the change

```bash
npm run typecheck                                        # clean
# Deno absent; suites run under Node with a Deno.test shim:
#   _shared/ai/errors_test.ts + all _shared/career-corpus/  → 43 passed / 0 failed
```

> **Not verified:** `_shared/ai/router_test.ts` (Node cannot load
> `https://esm.sh/@supabase/supabase-js` via `supabase-admin.ts`), `npm run lint` (hung at 0% CPU
> on two attempts), and **end-to-end behavior in the running app** — no tailored resume has been
> generated against the new contract yet. Do not promote this to a version restore point until
> that happens.

---

## v1.3.0 — Match Score gate + drag-and-drop kanban

**Date:** 2026-09-14
**Version label in UI:** `beta v1.3 · <MMDD.HHmm>`
**Status:** ✅ Verified working end-to-end by the user — the match-score gate ("working for
jobs > 80") and the drag-and-drop kanban were both confirmed in the running app.

### Why this is a restore point

Both features of this release are confirmed working in the app, not just green in CI: the
gate correctly skips low-scoring jobs before any AI spend while still reporting them, and
the kanban board persists status changes by drag. This is the state to return to if a later
change breaks scoring, the per-job chain, or the jobs board.

### What changed

`Match Score` moved to run **first inside the per-job fan-out**, immediately after
`Store Job`, and became a **gate**:

- it scores each job against the **master resume** (not the tailored one — that does not
  exist yet at this point in the chain);
- jobs scoring **above** `settings.jobSearch.minMatchScore` (new setting, default **80**,
  strictly greater-than) continue to `ATS Optimizer` and the rest of the chain;
- jobs at or below the threshold return a skip output, and `job-pipeline.ts` halts the
  remaining steps — no Gemini call, LaTeX build, PDF compile or upload;
- gated jobs keep their real score, stay in `discovered`, and are listed in the summary
  email under *"Below your N% match threshold"*, so nothing disappears;
- `Store Job` now inserts as `discovered` / `resume_status: 'none'`; a passing score
  promotes the row to `queued` / `generating`. `Upload to Storage` still sets
  `resume_ready`, so the progression is `discovered → queued → resume_ready → applied → …`.
- the `Match Score` node in the execution graph now logs `Company — Role — match score N%`
  plus the gate decision, so opening it shows which company scored what.

### Pipeline shape

```text
Per-job fan-out (one slice per job)
  Store Job → Match Score ⇥ (gate) → ATS Optimizer → Build LaTeX → Compile PDF → Upload to Storage
```

### New / changed files

| File | Change |
|------|--------|
| `supabase/functions/_shared/workflow/match-gate.ts` | **New.** Threshold resolution, gate predicate, skip output, node log lines, email section. |
| `supabase/functions/_shared/workflow/match-gate_test.ts` | **New.** 15 tests. |
| `src/constants/workflow-seed.ts` | `Match Score` moved to x=2000, `ATS Optimizer` to x=2200. |
| `supabase/functions/_shared/workflow/nodes.ts` | `match_score` scores master + gates + persists status; `Store Job` inserts `discovered`; `email_summary` gained the below-threshold section and a Match column. |
| `supabase/functions/_shared/workflow/job-pipeline.ts` | Detects the gate skip, halts the chain, emits the score logs. |
| `src/pages/SettingsPage.tsx` | New **Minimum match score** field. |
| `src/components/jobs/JobKanbanBoard.tsx` | **New.** Drag-and-drop kanban board. |
| `src/utils/job-kanban.ts` + `_test.ts` | **New.** Column model, grouping, optimistic move, warnings. 10 tests. |
| `src/services/index.ts` | `JobSearchService.updateStatus` now scopes by `user_id`. |
| `tsconfig.app.json` | Excludes `src/**/*_test.ts` (Deno globals). |

### Kanban drag-and-drop

Cards can be dragged between status columns, JIRA-style. Implementation notes:

- **Native HTML5 drag-and-drop**, no new dependency. A custom MIME type
  (`application/x-careerpilot-job`) means foreign drags are never accepted.
- **`dragenter`/`dragleave` are depth-counted per column.** Those events also fire for child
  elements, so a naive boolean flickers as the pointer crosses each card.
- **Optimistic update with rollback.** `withJobStatus` preserves array position, so a dropped
  card does not jump; on failure the previous cache is restored and a toast explains why.
- **Every move is allowed**, but `jobMoveWarning` adds a caveat when a job is moved to
  `Resume Ready` or `Applied` with no resume attached.
- **Accessibility:** native DnD is mouse-only, so each card also has a keyboard- and
  screen-reader-accessible **"Move to"** menu. That menu is the a11y path, not a decorative
  extra — do not remove it.

### Rollback

No migration was added, so rolling back is code-only. Reverting the seed order requires
re-running a job search so `repairDefaultPipelineGraph` rewires the edges.

> **Caveat:** existing jobs already marked `resume_ready` under the old rule were left
> untouched by explicit choice — no backfill migration was written.

### Verification performed

```bash
npm run typecheck                                    # clean
npx eslint .                                         # 38 problems (pre-existing baseline, none added)
npm run build                                        # passes
deno test --allow-all --no-check src/utils/          # 10 passed
cd supabase/functions
deno test --allow-all --no-check _shared/workflow/   # 93 passed
```

Plus manual confirmation in the running app: jobs scoring above 80 flow through the full
chain, low scorers stop at the gate and stay in Discovered, and kanban cards drag between
status columns.

> **Not covered by automated tests:** the drag-and-drop interaction itself. No Chrome
> DevTools MCP is configured on this machine, so the DnD event wiring (drop highlight,
> empty-column drops, drag vs. click on a card) was verified by hand, not by a test. The
> pure model in `src/utils/job-kanban.ts` *is* unit-tested.

---

## v1.2.0 — Stable pipeline: batched per-role runs + self-healing graph

**Date:** 2026-09-14
**Version label in UI:** `beta v1.2 · <MMDD.HHmm>`
**Status:** ✅ Verified working end-to-end by the user ("working as expected")

### Why this is a restore point

This is the first state where the whole job-search pipeline is confirmed working after a
run of interlocking fixes: the per-role batch refactor, the `Fetch Results` infinite loop,
the `23505` / `57014` graph-provisioning failures, and a graph that had silently never
been migrated from an August seed. If a later change breaks execution, come back here.

### What works

- **One workflow run per search target**, executed strictly linearly (Apify free-tier
  friendly), each sending its own summary email.
- **Per-job fan-out** renders correctly on `/executions`: shared prefix → per-job branch →
  fan-in.
- **`Match Score` runs after `ATS Optimizer`**, inside the per-job fan-out, so it scores
  the *tailored* resume and writes `jobs.match_score` back.

  > **Superseded in 1.3.0.** `Match Score` was deliberately moved to run *before*
  > `ATS Optimizer` and became a gate against the master resume. If you restore this
  > 1.2.0 state you also revert the gate. See the 1.3.0 entry below.
- **The built-in graph self-heals on load** — missing nodes and edges are restored,
  retired steps removed, positions realigned, without ever rewriting the whole graph.

### Verified pipeline shape

```text
Shared prefix
  Daily 7 AM → Get Resume → Build LinkedIn URL → Start Apify Scrape
    → Check Apify Status ⇄ Wait 10s → Fetch Results → Parse Jobs
    → Filter Duplicates → Limit Jobs

Per-job fan-out (one slice per job)
  Store Job → ATS Optimizer → Match Score → Build LaTeX → Compile PDF → Upload to Storage

Fan-in
  Email Summary → Send Email
```

Node names may read `Get Resume` instead of `Sync Google Doc Resume` on older graphs.
That is cosmetic and intentional — the repair matches on type + config, not name.

### Required migrations

Everything through **`027_workflow_edges_unique.sql`** must be applied. In particular:

| Migration | Why it matters |
| --- | --- |
| `026_run_batches.sql` | `workflow_run_batches` + batch columns; the partial unique index on `(batch_id, batch_index)` is what prevents double-spawning a target |
| `027_workflow_edges_unique.sql` | Dedupes `workflow_edges` and enforces uniqueness, so a duplicate edge can't fork a run |

### Validation performed

```bash
deno test --allow-all --no-check supabase/functions/_shared/workflow/   # 78 passed / 0 failed
npm run typecheck                                                      # clean
npm run build                                                          # passes
npm run lint                                                           # 38 pre-existing problems, no new ones
```

`deno check` reports 6 errors in files untouched by this work
(`resume-drive.ts:51`, `execution-persistence.ts:426`, `nodes.ts:725/994/999/1013`);
these were verified to exist identically on `origin/main` and are out of scope.

### Load-bearing code — change with care

| File | Why it's sensitive |
| --- | --- |
| `src/utils/pipeline-repair.ts` | Pure planner for graph reconciliation. 18 tests. Matches nodes by `type` + `action`/`builtin`, **never by name**. |
| `src/services/index.ts` → `repairDefaultPipelineGraph` | Must only write deltas. Calling `saveGraph` here is what caused `23505`/`57014`. |
| `src/services/index.ts` → `saveGraph` | Destructive: deletes every node and edge, then re-inserts. Only safe for provisioning a new workflow or an explicit user save. |
| `supabase/functions/_shared/workflow/run-batch.ts` | Batch fan-out and linearity. 12 tests. |
| `src/constants/workflow-seed.ts` | Node order is load-bearing: `positionX` drives the prefix / fan-out / fan-in split in `src/utils/execution-graph.ts`. |

### Known cosmetic notes

- `Upload to Drive` (`gdrive`) was removed from the graph. Drive sync is manual, from the
  Resume workspace. Historical runs that executed that node may render it without a name.
- Roles are capped at 5 in Settings (up to 10 runs/emails per day with India-remote on).

### If you need to roll back

1. Check out this version.
2. Do **not** roll back migrations — `026` and `027` are additive and safe to leave applied.
3. Reload the app once; `repairDefaultPipelineGraph` reconciles the graph on load.
4. Confirm on `/executions` that the fan-out shows
   `Store Job → ATS Optimizer → Match Score → …` before running a search.

---

## Recording a new restore point

1. Confirm the app actually works — not just that tests pass.
2. `npm run version:bump`, then commit.
3. Tag it: `git tag -a v<version>-<short-name> -m "<what works>"` and `git push --tags`.
4. Add an entry here with: what works, the verified pipeline shape, required migrations,
   the validation commands and their results, and any load-bearing code to be careful with.
