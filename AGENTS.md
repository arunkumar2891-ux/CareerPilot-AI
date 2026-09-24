# AGENTS.md — AI Coding Agent Instructions

## Project

CareerPilot-AI: Autonomous AI job search platform. React SPA + Supabase Edge Functions backend. See `CONTEXT.md` for architecture. See `docs/FEATURE_MAP.md` for feature locations.

## Development Environments

**This project is developed on two machines. `deno` is only on one of them — check which machine
you are on before assuming a command will run.**

| | Windows dev box | MacBook |
|---|---|---|
| `git` | ✅ installed | ✅ installed |
| `deno` | ❌ **not installed** | ✅ installed |
| `node` | ✅ v24 (strips TypeScript natively) | ✅ |
| Backend tests | Node shim only, `apify-poll_test.ts` + `router_test.ts` **cannot run** | ✅ full `deno test`, authoritative |

`git` may not be on `PATH` in a fresh Windows shell even though it is installed — if `git` is not
found, locate the binary rather than concluding it is unavailable.

**The MacBook is the authoritative validation environment** for backend tests. A backend change
validated only on the Windows box has not been fully tested — say so explicitly rather than
implying a green suite. Work that must happen on the Mac:

- `deno test --allow-all --no-check supabase/functions/_shared/workflow/` and `.../ai/` — the two
  suites the Node shim cannot load (see Validation Commands).

> ⚠️ **Line endings are not normalized.** There is no `.gitattributes`, `core.autocrlf` is unset,
> and all 124 files under `src/` are currently CRLF. Editing the same file on both machines will
> produce whole-file phantom diffs. Adding `.gitattributes` with `* text=auto eol=lf` would fix
> this, but triggers a one-time renormalization commit touching nearly every file — do it
> deliberately, as its own commit, not bundled into a feature change.

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
  This applies to **both** built-in graphs: the job-search pipeline *and* the
  `Resume Tailoring` graph (`repairTailorPipelineGraph`). Both repairs must be delta-based,
  signature-matched, and guarded by an in-flight promise.
- **Match workflow nodes by `type` + `action`/`builtin` first; never by display name *alone*.**
  Names have drifted across seed versions (`Get Resume` → `Sync Google Doc Resume`), so
  name-first matching silently fails and leaves nodes unwired. `planPipelineRepair` resolves in
  three ordered passes — (1) `type` + `action`/`builtin` signature, (2) exact seed name, for
  nodes whose *config* drifted, (3) the sole remaining node of that type. Pass 1 is what makes
  the rename case safe; passes 2–3 are fallbacks and must never run first.
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
- **`Match Score` is a gate, and must stay the first *scoring* step in the fan-out.** The fan-out
  entry node is `Store Job` (`isJobPipelineStart` keys on `supabase` / `insert_job`), so
  `Match Score` is `chain[1]`, immediately after it — not `chain[0]`. It scores against the master
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
  `PROFESSIONAL EXPERIENCE`, `SELECTED PROJECTS`, `CERTIFICATION`, `EDUCATION`.
  `SELECTED PROJECTS` and `CERTIFICATION` are in `OPTIONAL_HEADERS` — omitted when the source
  has none.
- **`SELECTED PROJECTS` was called `PERSONAL PROJECTS` before v1.4.0.** The old name is kept as
  a `HEADER_ALIASES` entry and in `resume-latex.ts`'s `PROJECT_SECTION_HEADERS`, because existing
  master resumes and cached tailored resumes still use it. Removing either alias silently drops
  the section from those resumes (BUG-004's failure mode).
- **Each project carries an optional `- Type: Official` / `- Type: Personal` meta line.** The
  prompt tells the model to derive it from the source resume only and to omit it when the source
  is unclear, so the grounding contract still holds. `resume-latex.ts` treats `Type:` as project
  *meta* (via `PROJECT_META_RE`), not an achievement bullet, and `sortProjectMeta` renders it
  above `Technologies:`.
- **`CONTACT` may carry an optional `Website:` line** (aliases: `Portfolio:`, `Homepage:`, `Site:`),
  emitted **after `GitHub:`** and sourced from the resume rather than Settings. It must be pulled out
  deterministically by `extractContactWebsite()` — **`overlayIdentitySections()` replaces the whole
  CONTACT section with `formatContact(contact)`**, so a line the model emitted but the contact block
  lacks is silently dropped. Add a contact field anywhere else and it will not survive.
  In `classic` / `modern_single` it renders via moderncv's `\homepage{...}`, which **prepends the
  protocol itself** — pass the scheme-stripped label from `formatWebsiteLabel()` or you get
  `http://https://example.com`. Only `modern_two_column` (plain `article` + `hyperref`) takes an
  absolute URL, via `buildWebsiteUrl()`.
- **`formatContact()` output is resume content, not prompt context.** `overlayIdentitySections()`
  writes it **verbatim** into CONTACT, so every line it emits lands in the finished resume. This is
  how `PANW start: Jul 2024` — an internal hint for `[Start Date]` token substitution — appeared in
  every generated resume. `INTERNAL_CONTACT_LINE_RE` now strips `PANW start:` / `Role focus:` in both
  `canonicalizeAtsResumeOutput()` and the overlay. Before adding a field there, ask whether a
  recruiter should see it; internal metadata belongs in the user prompt.
- **`canonicalizeAtsResumeOutput` rewrites alias headers before its fast path.** Aliases satisfy
  `hasAllRequiredHeaders()`, so without that rewrite an otherwise-complete resume short-circuits
  and keeps a stale heading.
- **`REQUIRED_HEADERS` is the single source of section order.** It drives `canonicalHeader`,
  `countRequiredHeaders`, `joinSections`, `dedupeSectionLines`, and `dropUnsupportedContentLine`.
  Add a section there and ordering follows; add it anywhere else and it won't.
- **A section missing from `REQUIRED_HEADERS` is silently swallowed, not rejected.**
  `parseAtsSections` treats its header as *body text of the preceding section*, and
  `joinSections` re-emits it that way. This is how `SELECTED PROJECTS` (then `PERSONAL PROJECTS`)
  used to vanish (BUG-004).
- **Optional sections are only mandatory when a source was supplied.** That lookup lives in
  `optionalHeaderSource()`; extend it rather than hardwiring a new `*Source` option into the
  header loop.
- **Sections whose lines are not verbatim source bullets need `allowAggregate` in
  `validateGrounding`.** `SUMMARY`, `SKILLS`, `CERTIFICATION`, and `SELECTED PROJECTS` have it.
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

## Multi-Tenancy Guardrails

This started as a single-user app and was audited for multi-user readiness (BUG-011 … BUG-014).
Those fixes are easy to undo by accident, so:

- **Edge Functions use the service-role key, which bypasses RLS entirely.** Every
 `createAdminClient()` query must filter `user_id` itself. A `.eq('id', x)` with no
 `.eq('user_id', …)` is a bug even when the current caller happens to fetch scoped first —
 that is caller ordering, not a property of the function. Where a helper writes on a
 caller-supplied id, make `userId` a **required** parameter (see
 `_shared/resume-store.ts` → `linkResumePdf`), so a new call site cannot silently omit it.
- **Only 7 tables are created in `supabase/migrations/`.** The other ~22 (`jobs`, `resumes`,
 `profiles`, `integrations`, `notifications`, `agents`, `workflow_runs`, …) were created via the
 Supabase dashboard, so **their RLS status is not knowable from this repo** — do not assume it.
 Frontend `user_id` filters are defence-in-depth *on top of* RLS, not a substitute.
- **An endpoint with no `Authorization` header cannot trust its input for identity.**
 `google-oauth-callback` is a bare browser redirect, so `state` must be *verified*, not decoded.
 `btoa(JSON.stringify(...))` is an encoding, not a signature. Use
 `_shared/oauth-state.ts`. The signing key falls back to `SUPABASE_SERVICE_ROLE_KEY` on purpose,
 so the protection needs no new configuration to be effective.
- **Secret checks must fail closed.** `if (secret && authHeader !== …)` skips the check entirely
 when the secret is unset. Use `_shared/scheduler-auth.ts` → `checkSchedulerAuth`, which returns
 **503 for a missing secret** and 401 for a wrong one — a silently-dead scheduler otherwise looks
 identical to "nothing is due".
- **A per-user integration credential must outrank a global env secret.**
 `getSecretOrIntegration()` checks the user's credential first. Inverting it pools every tenant's
 quota, billing, and (for Apify) job-search history into one account, and silently ignores a key
 the user connected themselves.
- **Never hardcode biographical data, and never "correct" resume content.** There is no default
 degree, employer, or name anchor. A rewrite rule keyed on real resume text (rather than a
 `[Placeholder]`) *destroys* a valid credential for anyone it matches — that is what
 `replaceEducationPlaceholders` used to do to an Anna University degree. When a field is not
 configured, leave the placeholder **visible**: the user will notice a `[Degree Name]`, but they
 will never think to double-check a plausible invented one.
- **Match resume structure, not literal names.** The name/title overlay keys on position and shape
 (`overlayResumeHeader`) and company headers on the contract's `COMPANY | Role` shape
 (`isExperienceHeaderLine`). A literal `/^ARUN KUMAR/m` or an employer whitelist makes the feature
 a silent no-op for every other user. `identity-overlay_test.ts` pins this.
- **New-account defaults must be neutral and cheap.** `alsoSearchIndiaRemote` defaulted on for
 everyone, doubling a new user's runs, AI spend, and summary emails. Anything that multiplies cost
 or email volume is opt-in; migrate existing users with an explicit backfill rather than by
 leaving the default on.

## Frontend UI & Motion Guardrails

The UI was hardened in a four-phase pass (see `BUG_LOG.md` → BUG-006/BUG-007 and the
2026-09-17 UI audit table). These rules encode what that pass established — breaking them
reintroduces defects that were specifically fixed.

### Motion

All motion primitives live in `src/lib/motion.ts`. Do not hand-roll durations or curves
in components.

- **`useReducedMotion()` is a *user preference* check only.** It must never include a
  viewport width. An earlier version matched `(max-width: 1023px)` too, which silenced
  every animation on phones and tablets — including press feedback — so the app felt inert
  on the majority form factor. Viewport-based trimming of *decorative* effects belongs in
  **`useHeavyMotionEnabled()`**, which is about GPU cost. Never gate interaction feedback
  on it.
- **Never rely on framer's `staggerChildren` for a server-driven list.** It multiplies by
  index with no ceiling, so 50 rows becomes a 2-second tail. `StaggerList` injects a
  positional `index` and `staggerItem` clamps it to `MAX_STAGGER_INDEX` (8). Keep the total
  cascade under 500ms.
- **Entrances decelerate (`EASE_OUT`), exits accelerate (`EASE_IN`).** Reusing `EASE_OUT`
  on an exit makes dismissals look dragged. Exits are also shorter than entrances.
- **Never animate layout properties.** `collapseVariants` uses `scaleY` +
  `transformOrigin: top`, *not* `height: 0 → 'auto'`. Callers must add `overflow-hidden`.
- `DURATION.base` (0.28s) is tuned for cards and list rows. Modals/page transitions use
  `DURATION.slow`; press/toggle feedback uses `DURATION.fast`.

### Press feedback lives in `index.css`, deliberately

`src/components/ui/` is shadcn-generated and must not be hand-edited, so the `:active`
press state for **every** button is a rule in `src/index.css` rather than a variant in
`ui/button.tsx`. Three things about it are load-bearing:

- It is written **unlayered**. Unlayered CSS outranks Tailwind's `@layer utilities`, which
  is what lets `transform` actually transition on elements carrying `transition-colors`
  (that utility restricts `transition-property` and would make the press snap).
- It targets `button` only — **not** `[role="button"]`. Clickable cards get their press
  from framer-motion's `pressable`, and matching both would compound the two scales.
- It has a `prefers-reduced-motion` override.

### Errors are not empty states

- **A failed fetch must never render an `EmptyState`.** Doing so tells the user their data
  does not exist when it merely failed to load. Every data region branches
  `isLoading → error → empty → content`, using `src/components/shared/ErrorState.tsx`
  (which carries `role="alert"` and a retry). A toast is not sufficient — it vanishes and
  leaves an authoritative-looking screen that is wrong.
- `ErrorBoundary` is mounted twice: inside `AppLayout`'s `<main>` keyed on `pathname` (so a
  page crash leaves the nav usable and navigating away clears it), and around `<Routes>` in
  `App.tsx` for `AuthPage` and the layout chrome. It catches **render-phase** throws only —
  async rejections and event-handler errors still need local handling.

### Page headers must survive 320px

`<main>` in `AppLayout` has `overflow-x-hidden`, so an over-wide header row is **clipped,
not scrollable** — buttons become unreachable, not merely cramped. Never pass a bare
`<div className="flex gap-2">` of buttons into `PageHeader`; use
`src/components/shared/HeaderActions.tsx`, which keeps the primary action visible and
collapses the rest into an overflow menu below `sm`.

### A responsive grid needs an explicit `grid-cols-1`

Tailwind's `grid` class is **`display:grid` and nothing else** — it sets no
`grid-template-columns`. Items then land in an *implicit* track, implicit tracks are sized
`auto`, and an `auto` track's minimum is its content's **min-content width**. So
`grid gap-4 lg:grid-cols-3` is unconstrained below `lg` and a wide descendant can push it past
the viewport. `grid-cols-1` compiles to `repeat(1, minmax(0, 1fr))` — a floor of **0**.

- **Always write the mobile column count explicitly:** `grid grid-cols-1 gap-4 lg:grid-cols-3`.
  It is not redundant, and it costs nothing at `lg` where the override wins.
- **Grid and flex children that contain text or a chart need `min-w-0`.** A flex item's default
  `min-width:auto` refuses to shrink below its content, so a long unbreakable string sets the
  floor. Pair with `truncate` or `break-words` on the text itself, and `shrink-0` on adjacent
  icons.
- Combined with `<main>`'s `overflow-x-hidden`, both defects **clip rather than scroll** — the
  content is unreachable, not just cramped. This is the same failure mode as BUG-007 and is what
  BUG-008 fixed on the dashboard.

### `ScrollArea` needs a definite height

Radix's `ScrollArea.Root` is `overflow-hidden` and its `Viewport` is `h-full`. Give the Root an
`h-auto`/`max-h-*` and the `height:100%` resolves against an auto-height parent, so the Viewport
never becomes a scroll container — the Root just **clips, with no scrollbar**, and the overflowing
rows are unreachable. Use a definite height (`h-[240px]`). Trimming it responsively is fine
(`h-[180px] lg:h-[240px]`) as long as every branch is definite. (BUG-008)

### Never animate `height` — `collapseVariants` exists for this

`height: 0 → 'auto'` triggers layout on every frame and cannot be composited.
`src/lib/motion.ts` → `collapseVariants()` does it with `scaleY` + `transformOrigin: top`
instead; callers must add `overflow-hidden`.

### Semantics

- `PageHeader` renders the page's single `<h1>`; `SectionHeading` is the `<h2>` tier;
  `CardTitle` is `<h3>`. Do not jump h1 → h3.
- Collections of peer records use `StaggerList as="ul"` + `StaggerItem as="li"` with a
  `label`. Metric/stat grids stay `div`s — a dashboard is not a list.
- `StaggerItem` with `onClick` automatically gets `role="button"`, `tabIndex`, and
  Enter/Space handling. Do not add a bare `onClick` to a non-interactive element.
- Every icon-only control needs `aria-label`. When auditing this, match the **whole JSX
  element**, not single lines — a line-scoped grep reports false positives because
  `aria-label` usually sits on the next line.

### Typography and theme

- Fonts are **Inter Tight** (sans) and **JetBrains Mono** (mono), loaded from Google Fonts
  in `index.html` and registered in `tailwind.config.js`. Before this, no webfont was
  loaded at all and `index.css` carried inert Inter-only feature settings.
- **`text-2xs` (0.625rem/10px) is the badge/meta tier below `text-xs`.** Use it instead of
  `text-[10px]`, which it replaced at 33 sites. It is registered as a **bare string**, not a
  `[size, { lineHeight }]` tuple, on purpose: a tuple also emits `line-height`, which the
  arbitrary sites it replaced never set. Adding one there would shift every badge and caption.
- `--brand-jade` is the logo mark's fixed colour and is **deliberately not overridden in
  `.dark`** — the lockup's planes are the same green on both backgrounds; only the wordmark
  and baseline invert. Never point the mark at `--primary`, which does shift.
- `.gradient-text` must stay within the brand hue (forest → sage). Do not reintroduce a
  cross-hue (cyan → violet) gradient.

## Scheduling Guardrails

The daily run costs the user real money (AI calls) and can send real email, so the off switch
has to be trustworthy. `automations.status === 'active'` is the **single gate** —
`processScheduledAutomations()` filters on it and `claimScheduledAutomation()` re-checks it
inside its atomic claim, so nothing else needs to know about the toggle.

- **`repairDefaultAutomation` runs on every login, so anything it "repairs" it repairs
  repeatedly.** Treat a `paused` automation as a user decision it must never override. Its
  sibling query must select **all** statuses: filtering `.eq('status','active')` made a paused
  row invisible, and the method then inserted a fresh `active` one and restarted a schedule the
  user had turned off (BUG-015). `'error'` is *not* a pause — that is a failed run.
- **Expose enable/disable as an explicit setter, never a blind toggle.**
  `setDailyJobSearchEnabled(enabled)` takes the desired state, so a stale UI value cannot flip
  the schedule the wrong way, and writing the same value twice is harmless. A
  `toggle()`-shaped API called twice silently re-enables the run.
- **Recompute `next_run` when re-enabling.** A `next_run` left in the past makes the automation
  fire on the next scheduler tick instead of at the scheduled hour.
- **Update every sibling row when disabling,** not just the preferred one, or a duplicate left
  behind by earlier provisioning keeps running after the user switched the feature off.
- **Resolve the daily automation by workflow name, not `automations.name`.** The row is seeded
  `'Daily 7 AM Job Search'` while the workflow is `DEFAULT_JOB_SEARCH_WORKFLOW.name`; only the
  workflow name is authoritative, and the schedule in the display name will drift.
- The pure decisions live in `src/utils/daily-automation.ts` and are tested — keep them there
  rather than re-inlining the conditions into the service.

## Data Fetching Guardrails

- **`invalidateQueries` matches `queryKey` by *prefix*, so one call invalidates one key
  path — not a list of keys.** `{ queryKey: ['jobs', 'applications'] }` targets the single
  two-element key `['jobs','applications']`; it does **not** touch `['jobs']` or
  `['applications']`. Nearly every `useQuery` here registers a **one-element** key, so the
  combined spelling matches nothing and **fails silently** — no error, just a stale screen.
  This shipped in five places, including after auto-apply sent a real email (BUG-009).
  Use `invalidateAll(qc, ['jobs', 'applications'])` from `src/utils/query-keys.ts`.
- Multi-element keys are **not** wrong per se — `ExecutionDetailPage` correctly invalidates
  `['run-detail', runId]` because its `useQuery` registers exactly that. Before "fixing" one,
  find the matching `useQuery` and compare the key shape.
- After a mutation that sends something irreversible (email, a run), invalidate every cache
  the user can see it in. The Jobs board and Applications page read different keys.

## Tooling Hazards

- **Never rewrite a source file with PowerShell.** Windows PowerShell 5.1's `Get-Content` reads
  as ANSI and `Out-File`/`>` writes UTF-16 or ANSI, so the round-trip corrupts every non-ASCII
  character. Use the editing tools, or Node with an explicit `'utf8'` encoding. This has bitten
  this repo **twice**: once caught before commit, and once — BUG-010 — **shipped**, garbling
  every `…`, `—`, `·`, `→`, and `•` in the UI across 12 files.
- **A green typecheck/lint/build proves nothing about encoding.** Mojibake inside a string
  literal is valid TypeScript, so `tsc`, `eslint`, and `vite build` all pass on a corrupted
  file. It only appears as garbled text at runtime.
- **After any scripted bulk edit, run `npm run check:encoding`** (scans all ~220 source files;
  exits non-zero on a hit). Repair with `node scripts/fix-mojibake.mjs --write <files...>` —
  the transformation is exactly invertible.
- **Mojibake here is CP1252, not Latin-1 — this distinction is why the bug shipped.** Byte
  `0x80` decodes to `U+20AC` (`€`) under Windows-1252 but `U+0080` under Latin-1, so an em dash
  corrupts to a sequence containing **no `Ã` at all**. The first version of
  `check-encoding.mjs` searched only for the `Ã` family, reported 94 genuinely-corrupted
  occurrences as clean, and I trusted it. Derive the expected mangled form by *simulating* the
  corruption (encode UTF-8 → decode CP1252); never hand-write the byte sequences.
  `scripts/check-encoding_test.mjs` pins this with 9 cases — run it if you touch the checker.
- **Verify a machine-generated change against git, not just the toolchain.** Extract the blob
  with `git cat-file blob <sha>:<path>` and diff in Node. Do **not** use PowerShell redirection
  (`>`) to capture it — that re-corrupts the bytes you are trying to inspect. `git show > file`
  has the same problem.

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
| Motion primitives (durations, curves, stagger cap) | `src/lib/motion.ts` |
| Design tokens, press feedback, keyframes | `src/index.css` |
| Font + Tailwind token registration | `index.html`, `tailwind.config.js` |
| Brand mark / horizontal lockup | `src/components/brand/LogoMark.tsx`, `LogoLockup.tsx` |
| Render-crash boundary | `src/components/shared/ErrorBoundary.tsx` |
| Data-failure state (not empty state) | `src/components/shared/ErrorState.tsx` |
| Empty state | `src/components/shared/EmptyState.tsx` |
| Page title (h1) + section heading (h2) | `src/components/shared/PageHeader.tsx` |
| Responsive page-header action row | `src/components/shared/HeaderActions.tsx` |
| Staggered list + list semantics | `src/components/motion/StaggerList.tsx` |
| Workflow engine | `supabase/functions/_shared/workflow/executor.ts` |
| Run batches (one run per role) | `supabase/functions/_shared/workflow/run-batch.ts` |
| Per-job fan-out | `supabase/functions/_shared/workflow/job-pipeline.ts` |
| Default pipeline definition | `src/constants/workflow-seed.ts` |
| Graph repair planner | `src/utils/pipeline-repair.ts` |
| Graph provisioning | `src/services/index.ts` → `ensureDefaultPipeline` / `ensureTailorPipeline` |
| Execution graph rendering | `src/utils/execution-graph.ts` |
| AI provider routing | `supabase/functions/_shared/ai/router.ts` |
| Auto-apply (sends real email) | `supabase/functions/auto-apply/index.ts` + `_shared/gmail-send.ts` + `_shared/apply-email.ts` |
| Interview prep | `supabase/functions/resume-actions/index.ts` (`mode: 'interview_prep'`) |
| Resume output contract (prompt) | `supabase/functions/_shared/career-corpus/prompt.ts` → `ATS_SYSTEM_PROMPT` |
| Resume output contract (validator) | `supabase/functions/_shared/ai/validate-resume.ts` → `REQUIRED_HEADERS` |
| Resume corpus logic | `supabase/functions/_shared/career-corpus/` |
| Google Drive integration | `supabase/functions/_shared/google-drive.ts` |
| DB migrations | `supabase/migrations/` |
| App version label | `src/lib/version.ts` |
| Jobs kanban board | `src/components/jobs/JobKanbanBoard.tsx` + `src/utils/job-kanban.ts` |
| Job detail modal (badges, match panel, apply-via-email) | `src/components/jobs/JobDetailDialog.tsx` |
| Jobs filter + apply-eligibility logic (tested) | `src/utils/job-filters.ts` + `job-filters_test.ts` |
| Signed OAuth `state` | `supabase/functions/_shared/oauth-state.ts` |
| Scheduler endpoint auth (fail-closed) | `supabase/functions/_shared/scheduler-auth.ts` |
| Multi-cache invalidation helper | `src/utils/query-keys.ts` → `invalidateAll` |
| Daily-run provisioning decisions (tested) | `src/utils/daily-automation.ts` + `daily-automation_test.ts` |
| Encoding audit for scripted edits | `scripts/check-encoding.mjs` (`npm run check:encoding`) + `check-encoding_test.mjs`; repair via `scripts/fix-mojibake.mjs` |

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

Before blaming recent work for a bug, check whether the defect pre-exists. `git` is available on
both machines, so read history directly:

```bash
git log --oneline -10 -- <path>
git show <commit>:<path>
```

The repo is also public, so `raw.githubusercontent.com` and the GitHub API remain a fallback if a
shell has no `git` on `PATH`:

```
https://raw.githubusercontent.com/arunkumar2891-ux/CareerPilot-AI/main/<path>
https://api.github.com/repos/arunkumar2891-ux/CareerPilot-AI/commits?path=<path>
```

One tag exists: `v1.4.0-brand-ui-hardening` → `435c78b`. **Do not identify a release by its
`package.json` version alone** — three commits (`ea9b51b`, `2f2e42c`, `bdd22c4`) share `1.3.0`
with the v1.3.0 restore point, because the brand/UI work was bumped only afterwards, in
`1a46d16`. Use the commit SHAs recorded in `RESTORE_POINTS.md`. Comparing against `origin/main`
has twice prevented misattribution (BUG-003) and revealed that a user's DB graph predated the
current seed.

> `tsc` and `eslint` can take minutes on the Windows box, and `eslint` has been observed hanging
> at 0% CPU. Prefer narrow invocations (a single file) over full-tree scans there.

## Validation Commands

Runs on either machine:

```bash
npm run typecheck    # Type checking
npm run lint         # ESLint — 40 pre-existing problems; add none
npm run build        # Full build verification
```

> The 40 are all unused imports/vars, three `no-empty-object-type` in `src/components/ui/`, and
> six `react-refresh` warnings. Attribute before fixing: run `npx eslint <file>` and compare
> against `git show HEAD:<file>`. Older docs quote a baseline of **38**; that number predates
> `ea9b51b`.

### Frontend / UI changes

There is **no browser test runner and no browser-automation tooling in the agent
environment**, so visual and interaction behaviour cannot be self-verified. A UI change that
typechecks, lints, and builds is *unverified*, not *working* — say so explicitly and name what
needs a human eye. Responsive work in particular must be checked by hand at **320px, 768px,
1024px, 1440px** (per `.cursor/skills/frontend-ui-engineering`).

`npm run dev` serves on `http://localhost:5173`. `Start-Process npm` fails on the Windows box
("not a valid Win32 application") — run `npm run dev` directly and background it.

When auditing the frontend with grep, **prefer whole-element matches over line-scoped ones.**
A line-scoped search for `aria-label` beside `size="icon"` reported 18 unlabeled buttons when
the real number was 1 — the attribute sits on the *following* line. Walk from the opening tag
to the closing tag before concluding anything.

### Backend tests — MacBook (authoritative)

Deno is installed there, so run the real suites. **This is the only way to fully validate a
backend change:**

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

### Backend tests — Windows box (partial fallback)

Deno is not installed. Pure-logic suites run under Node via the shim at
`scripts/run-deno-tests.mjs`, which defines `globalThis.Deno` with `test`/`env`, collects the
cases, awaits them, and reports pass/fail:

```bash
node --experimental-strip-types scripts/run-deno-tests.mjs \
  supabase/functions/_shared/workflow/pipeline-repair_test.ts \
  src/utils/job-kanban_test.ts
```

Node is v24, which strips TypeScript natively, so no transpile step is needed.

**Two suites cannot run this way** and must be validated on the Mac:
`_shared/workflow/apify-poll_test.ts` and `_shared/ai/router_test.ts`. Both transitively import
`https://esm.sh/@supabase/supabase-js` through `_shared/supabase-admin.ts`, and Node's loader
rejects remote URLs with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. Everything else passes: all of
`_shared/workflow/` (minus that one), `_shared/ai/errors_test.ts`, all of
`_shared/career-corpus/`, and `src/utils/` — 121 cases across 15 suites as of v1.3.0.

When you validate only on Windows, **state which suites were skipped** rather than reporting a
clean run.

## Releasing

Committing and tagging work on either machine. Step 1 should be backed by the full Deno suite,
which means the MacBook.

1. Verify the app actually works, not just that tests pass. Run the full Deno suites (see
   Validation Commands) so no suite is silently skipped.
2. `npm run version:bump`, then commit (a Render build cannot bump it — see `DEPLOY.md`).
   **Commit the lockfile too** — the script writes `package.json` *and* both `version` fields in
   `package-lock.json`. The lock was nevertheless left at `1.2.0` while `package.json` read
   `1.3.0`, so for v1.3.0 either the script was bypassed or its lockfile edit was never staged.
   Verify with `git show <commit> -- package-lock.json`.
3. If the state is confirmed good, add an entry to `RESTORE_POINTS.md`.
4. Tag it: `git tag -a v<version>-<short-name> <commit> -m "<what works>"` and
   `git push origin refs/tags/<tag>`. **Pass the commit positionally** — folding it into the tag
   name (`v1.4.0-brand-ui-hardening-1a46d16`) tags `HEAD` instead and silently discards `-m`,
   leaving an empty-message tag on the wrong commit. Verify with
   `git for-each-ref --format='%(refname:short) %(*objectname:short) %(contents:subject)' refs/tags`.
   Only `v1.4.0-brand-ui-hardening` exists; v1.2.0 and v1.3.0 are still untagged.

> Current state: the brand/UI work is verified, recorded, bumped to `1.4.0`, and tagged
> `v1.4.0-brand-ui-hardening` → `435c78b`. `main` is in sync with `origin/main`. All four steps
> are complete for v1.4.0. Note that `bdd22c4` (verified), `1a46d16` (bump), and `435c78b`
> (docs) carry byte-identical code — the last two touch documentation and version metadata only.
