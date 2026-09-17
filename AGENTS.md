# AGENTS.md — AI Coding Agent Instructions

## Project

CareerPilot-AI: Autonomous AI job search platform. React SPA + Supabase Edge Functions backend. See `CONTEXT.md` for architecture. See `docs/FEATURE_MAP.md` for feature locations.

## Architecture

Read `CONTEXT.md` for stack, directory structure, and conventions.
Read `docs/FEATURE_MAP.md` to locate any feature's files.
Read `docs/features/<feature>.md` for deeper context on a specific feature.
Read `RESTORE_POINTS.md` for known-good versions and what each one verified.
Read `BUG_LOG.md` before changing anything it covers — especially **BUG-003** if you touch
workflow graph provisioning.

## General Rules

- Prefer existing patterns and architecture. Study nearby code before writing new code.
- Reuse existing services, utilities, components, and types.
- Avoid unnecessary abstractions or indirection.
- Make minimal, scoped changes. Do not refactor unrelated code.
- Preserve existing API contracts unless explicitly asked to change them.
- Do not modify database schema unless explicitly required. Append new migrations only.
- Do not introduce new dependencies without justification.
- Do not manually edit `src/components/ui/` (shadcn/ui generated).
- Do not modify `supabase/migrations/` (append-only, already applied).
- Do not modify lockfiles, `dist/`, or `components.json`.
- Keep changes scoped to the requested task.

## Workflow Engine Guardrails

The job-search pipeline is the most failure-prone area of this codebase. Read
`docs/features/workflow-engine.md` before changing it. Hard-won rules:

- **Never call `saveGraph()` from a repair or migration path.** It deletes and re-inserts
  every node and edge — slow enough to hit the statement timeout, and it re-uses existing
  primary keys. Write deltas via `src/utils/pipeline-repair.ts` instead. (BUG-003)
- **Match workflow nodes by `type` + `action`/`builtin`, never by display name.** Names have
  drifted across seed versions (`Get Resume` → `Sync Google Doc Resume`), so name matching
  silently fails and leaves nodes unwired.
- **Never leave a node orphaned.** `getEntryNodes()` treats any node with no incoming edge as
  an entry node, so an orphan executes as a stray start node and scrambles the run. Retired
  steps must be *deleted*, via `RETIRED_SEED_SIGNATURES`.
- **Gate graph migrations on the source shape, not the target shape.** A check like
  "are all desired edges present?" re-fires forever the next time the desired shape changes.
- **Node `positionX` is load-bearing.** `src/utils/execution-graph.ts` uses it to split the
  shared prefix, per-job fan-out, and fan-in. Reordering seed nodes changes the UI.
- **Two distinct fan-outs exist.** Run batches (one run per search target, `run-batch.ts`)
  and the per-job pipeline (one invocation per job, `job-pipeline.ts`). Don't conflate them.
- **Branching does not work inside the per-job fan-out.** `executePerJobPipeline` walks the
  chain **by array index** and ignores `result.route`; edge labels (`'true'`/`'false'`) only
  steer the top-level executor. To stop a job's chain early, return a *skip output* and detect
  it in `job-pipeline.ts` — see `isDuplicateSkipOutput` and `isBelowMatchScoreSkip`.
- **`Match Score` is a gate, and must stay first in the fan-out.** It scores against the master
  resume and skips the remaining steps when the score is not above
  `settings.jobSearch.minMatchScore`. Moving it after `ATS Optimizer` would spend the AI call it
  exists to avoid. See `_shared/workflow/match-gate.ts`.
- **`workflow_step_queue` writes must be idempotent.** Delete pending rows before inserting,
  and claim rows atomically (`.eq('status','pending')` on the update), or nodes re-execute.
- Any change to the seed graph or repair logic must keep
  `supabase/functions/_shared/workflow/pipeline-repair_test.ts` and `seed-graph_test.ts` green.

## Resume Contract Guardrails

Tailored resumes are governed by **two files that must agree**: the prompt
(`_shared/career-corpus/prompt.ts` → `ATS_SYSTEM_PROMPT`) tells the model what to emit, and the
validator (`_shared/ai/validate-resume.ts`) decides whether to accept it. Changing one without
the other either rejects valid output or lets drift through.

- **The contract is 8 sections, in this order:** `NAME`, `CONTACT`, `SUMMARY`, `SKILLS`,
  `PROFESSIONAL EXPERIENCE`, `PERSONAL PROJECTS`, `CERTIFICATION`, `EDUCATION`.
  `PERSONAL PROJECTS` and `CERTIFICATION` are in `OPTIONAL_HEADERS` — omitted when the source
  has none.
- **`REQUIRED_HEADERS` is the single source of section order.** It drives `canonicalHeader`,
  `countRequiredHeaders`, `joinSections`, `dedupeSectionLines`, and `dropUnsupportedContentLine`.
  Add a section there and ordering follows; add it anywhere else and it won't.
- **A section missing from `REQUIRED_HEADERS` is silently swallowed, not rejected.**
  `parseAtsSections` treats its header as *body text of the preceding section*, and
  `joinSections` re-emits it that way. This is how `PERSONAL PROJECTS` used to vanish (BUG-004).
- **Optional sections are only mandatory when a source was supplied.** That lookup lives in
  `optionalHeaderSource()`; extend it rather than hardwiring a new `*Source` option into the
  header loop.
- **Sections whose lines are not verbatim source bullets need `allowAggregate` in
  `validateGrounding`.** `SUMMARY`, `SKILLS`, `CERTIFICATION`, and `PERSONAL PROJECTS` have it.
  Project titles and `- Technologies: ...` lines are bullets, so the non-bullet exemption that
  `PROFESSIONAL EXPERIENCE` uses for its company/date headers does not cover them.
- **`validateTwoPageShape` caps are tuned to the categorized format** (SKILLS: 2,500 chars and
  24 lines, since each `Category:` heading costs a line). Prefer tightening the char cap over
  the line cap.
- **The prompt contract and the PDF renderer are separate.** `_shared/resume-latex.ts` has its
  own parsers and known gaps; a contract change does not imply the PDF renders correctly. Verify
  the PDF separately.
- Any contract change must keep `_shared/ai/errors_test.ts` and
  `_shared/career-corpus/generation-contract_test.ts` green, and needs an edge-function deploy
  (`workflow-run`, `workflow-step`, `ai-chat`) before tailored resumes pick it up.

## Context & Search Rules

1. **Read `CONTEXT.md` first** when you need architectural context.
2. **Read `docs/FEATURE_MAP.md`** to locate which files belong to a feature.
3. **For bug fixes,** start with the files explicitly identified in the bug report.
4. **Do NOT search the entire repository** as a first step.
5. **Trace imports/calls/dependencies** from the relevant files to find related code.
6. **Only expand the search boundary** when inspected code proves another file is relevant.
7. **Prefer targeted searches** using feature name, function name, component name, route, error message, or symbol — not broad pattern sweeps.
8. **Avoid reading large unrelated files.** `src/services/index.ts` is ~2,500 lines — search within it by class/function name rather than reading the whole file.
9. **Do not modify files** merely because they are nearby or conceptually related.
10. **Keep the final change set minimal.**

## Key Files Quick Reference

| What | Where |
|------|-------|
| All frontend types | `src/types/index.ts` |
| All frontend services | `src/services/index.ts` |
| All Zustand stores | `src/store/index.ts` |
| Supabase client | `src/lib/supabase.ts` |
| App routes | `src/App.tsx` |
| App layout shell | `src/layouts/AppLayout.tsx` |
| Workflow engine | `supabase/functions/_shared/workflow/executor.ts` |
| Run batches (one run per role) | `supabase/functions/_shared/workflow/run-batch.ts` |
| Per-job fan-out | `supabase/functions/_shared/workflow/job-pipeline.ts` |
| Default pipeline definition | `src/constants/workflow-seed.ts` |
| Graph repair planner | `src/utils/pipeline-repair.ts` |
| Graph provisioning | `src/services/index.ts` → `ensureDefaultPipeline` |
| Execution graph rendering | `src/utils/execution-graph.ts` |
| AI provider routing | `supabase/functions/_shared/ai/router.ts` |
| Resume output contract (prompt) | `supabase/functions/_shared/career-corpus/prompt.ts` → `ATS_SYSTEM_PROMPT` |
| Resume output contract (validator) | `supabase/functions/_shared/ai/validate-resume.ts` → `REQUIRED_HEADERS` |
| Resume corpus logic | `supabase/functions/_shared/career-corpus/` |
| Google Drive integration | `supabase/functions/_shared/google-drive.ts` |
| DB migrations | `supabase/migrations/` |
| App version label | `src/lib/version.ts` |
| Jobs kanban board | `src/components/jobs/JobKanbanBoard.tsx` + `src/utils/job-kanban.ts` |

## Bug-Fixing Workflow

**UNDERSTAND → IDENTIFY SCOPE → TRACE → DIAGNOSE → PLAN → MODIFY → VALIDATE**

### Before editing, confirm:

- Root cause identified with evidence
- List of files to modify and why each is relevant
- The fix is the smallest viable change

### After editing, report:

- Root cause
- Files changed and summary of changes
- Validation performed (`npm run typecheck`, `npm run lint`, manual testing)
- Any remaining risks

Use `BUGFIX.md` as the bug report template. Record resolved bugs in `BUG_LOG.md`.

### Attribution

Before blaming recent work for a bug, check whether the defect pre-exists. Local `git` **is**
available (2.39.5) — earlier revisions of this file said otherwise, so prefer `git log` and
`git show` over the GitHub API. No tags exist yet, so identify releases by the `package.json`
version in the commit. The repo is also public, so `raw.githubusercontent.com` remains a
fallback. Comparing against `origin/main` has twice prevented misattribution (BUG-003) and
revealed that a user's DB graph predated the current seed.

> `git status` can take minutes on this machine (as can `tsc` and `eslint`). Prefer narrow
> commands like `git log --oneline -10` over full working-tree scans.

## Validation Commands

```bash
npm run typecheck    # Type checking
npm run lint         # ESLint (38 pre-existing problems; add none)
npm run build        # Full build verification
```

Backend tests run under Deno:

```bash
deno test --allow-all --no-check supabase/functions/_shared/workflow/
deno test --allow-all --no-check supabase/functions/_shared/ai/            # incl. resume contract
deno test --allow-all --no-check supabase/functions/_shared/career-corpus/
```

Some frontend *pure logic* is also tested under Deno (there is no browser test runner).
`tsconfig.app.json` excludes `src/**/*_test.ts` so the `Deno` global does not break typecheck:

```bash
deno test --allow-all --no-check src/utils/
```

Notes:
- `--no-check` is needed because 6 type errors pre-exist in untouched files
  (`resume-drive.ts:51`, `execution-persistence.ts:426`, `nodes.ts:725/994/999/1013`).
- `_shared/resume-parse_test.ts` has a pre-existing broken import (`../resume-parse.ts`
  should be `./resume-parse.ts`), which blocks a whole-`_shared` test run.
- Deno tests that touch Supabase need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set
  (stub values are fine). On a network with TLS interception, set `DENO_TLS_CA_STORE=system`.
- **Deno is not installed on the primary dev machine.** Pure-logic suites can be run under
  Node instead (`node --experimental-strip-types`) with a throwaway shim that defines
  `globalThis.Deno = { test, env }` and awaits the collected cases. This works for
  `_shared/ai/errors_test.ts` and all of `_shared/career-corpus/`. It does **not** work for
  anything importing `_shared/supabase-admin.ts` (e.g. `_shared/ai/router_test.ts`), which
  pulls `https://esm.sh/@supabase/supabase-js` — Node's loader rejects remote URLs. Validate
  those by calling the function under test directly with the same arguments the caller passes,
  and flag that the suite itself was not executed.

## Releasing

1. Verify the app actually works, not just that tests pass.
2. `npm run version:bump`, then commit (a Render build cannot bump it — see `DEPLOY.md`).
3. If the state is confirmed good, add an entry to `RESTORE_POINTS.md` and tag it.
