# Restore Points

Known-good states you can return to. Each entry records what was verified, the exact
commands used to verify it, and what to do if you need to roll back.

To restore, check out the tag (or the commit) and re-apply the listed migrations:

```bash
git checkout v1.2.0-stable-pipeline
npm install
npm run build
```

If you are not using tags, find the commit by its version bump: search the history for
`package.json` version `1.2.0`.

> **The tag is not created yet.** `git` is not installed on the primary dev machine, so the
> version bump and this file are the durable marker. Once you have git available, run:
>
> ```bash
> git add -A
> git commit -m "v1.2.0 — stable pipeline: batched per-role runs + self-healing graph"
> git tag -a v1.2.0-stable-pipeline -m "Verified working: per-role batches, Match Score after ATS, self-healing graph"
> git push && git push --tags
> ```
>
> Until then, you can still return to this state by finding the commit whose `package.json`
> version is `1.2.0`.

---

## v1.3.0 — Match Score gate before ATS Optimizer

**Date:** 2026-09-14
**Status:** ⏳ Implemented; awaiting end-to-end confirmation from a live run

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

### Rollback

No migration was added, so rolling back is code-only. Reverting the seed order requires
re-running a job search so `repairDefaultPipelineGraph` rewires the edges.

> **Caveat:** existing jobs already marked `resume_ready` under the old rule were left
> untouched by explicit choice — no backfill migration was written.

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
