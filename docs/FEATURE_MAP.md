# Feature Map

Quick reference for locating feature code. For architecture overview, see `../CONTEXT.md`.
For deeper feature context, see `docs/features/*.md`.

---

## Authentication

- **Entry:** `src/pages/AuthPage.tsx`
- **UI:** `src/pages/AuthPage.tsx`
- **State:** `src/store/index.ts` → `useAuthStore`
- **Services:** `src/services/index.ts` → `UserService`
- **Supabase Client:** `src/lib/supabase.ts`, `src/lib/auth.ts`
- **Auth Provider:** Supabase Auth (email/password, Google OAuth, magic link)

---

## Dashboard

- **Entry:** `src/pages/DashboardPage.tsx`
- **Services:** `src/services/index.ts` → `AnalyticsService`, `WorkflowService`
- **Data:** Aggregated metrics from jobs, applications, resumes, AI usage
- **Responsive note:** the `Execution Queue` and `Recent Activity` cards stack their header
  and run-row badge below `sm`, and `Recent Activity`'s `ScrollArea` is only a fixed 240px
  from `lg` up — a hard height reserved dead space on phones.

---

## Job Discovery

- **Entry:** `src/pages/JobsPage.tsx`
- **UI:** `src/pages/JobsPage.tsx` (board/table shell, filters, bulk actions — 726 lines), `src/components/jobs/JobDetailDialog.tsx` (job detail modal: badges, description, match panel, interview prep, apply-via-email — 415 lines), `src/components/jobs/JobKanbanBoard.tsx`, `src/components/jobs/ApplicationPackageWizard.tsx` (4-step wizard: paste JD → score → generate → results; also orchestrates cover-letter and interview-prep generation, and is rendered from `ResumesPage.tsx` too)
- **Kanban model:** `src/utils/job-kanban.ts` (columns, grouping, optimistic move; drag-and-drop + a keyboard-accessible "Move to" menu)
- **Filter + selection logic:** `src/utils/job-filters.ts` (`matchesJobFilters`/`filterJobs`, `selectApplyableJobs`, `selectExtractableJobs`, `isGmailScopeError`) — pure and unit-tested in `src/utils/job-filters_test.ts` (16 cases)
- **Cache invalidation:** `src/utils/query-keys.ts` → `invalidateAll(qc, keys)`. Query keys are **prefix**-matched, so one key per call; see BUG-009.
- **Services:** `src/services/index.ts` → `JobSearchService`
- **Backend:** `supabase/functions/workflow-run/index.ts` (triggers job search workflow)
- **Workflow Engine:** `supabase/functions/_shared/workflow/executor.ts`, `job-discovery.ts`, `job-pipeline.ts`
- **AI Scoring:** `supabase/functions/_shared/career-corpus/score.ts`, `score-batch.ts`
- **Match gate:** `supabase/functions/_shared/workflow/match-gate.ts` (score > `settings.jobSearch.minMatchScore`, default 80, or the job's remaining steps are skipped and it stays `discovered`)
- **Deduplication:** `supabase/functions/_shared/job-dedupe.ts`
- **Utils:** `src/utils/jd-match.ts`, `src/utils/job-branch-status.ts`, `src/utils/job-search-roles.ts` (`MAX_SEARCH_ROLES = 5`)
- **DB:** `supabase/migrations/021_jobs_dedupe.sql`, `022_job_execution_role.sql`, `026_run_batches.sql`
- **Note:** Each search target runs as its own workflow run and sends its own email. See "Workflow Engine & Executions" below.

---

## Resume Management

- **Entry:** `src/pages/ResumesPage.tsx`
- **UI:** `src/components/resumes/ResumeEditor.tsx`, `src/components/resumes/JdMatchPanel.tsx`
- **Services:** `src/services/index.ts` → `ResumeService`, `ATSService`
- **Backend:** `supabase/functions/resume-actions/index.ts`
- **Shared:** `supabase/functions/_shared/resume-store.ts`, `resume-parse.ts`, `resume-pdf.ts`, `resume-drive.ts`, `resume-repair.ts`, `resume-latex.ts`
- **Utils:** `src/utils/resume-classification.ts`, `src/utils/resume-name.ts`, `src/utils/upload-sanitize.ts`
- **DB:** `supabase/migrations/014_resumes_drive_pdf.sql`, `016_resumes_is_corpus.sql`, `019_resume_corpus_type.sql`

---

## Career Corpus

- **Entry:** `src/pages/CorpusPage.tsx`
- **Frontend Content:** `src/content/career-corpus/index.ts`
- **Backend:** `supabase/functions/_shared/career-corpus/` (generate, load, prompt, score)
- **Resume output contract:** `_shared/career-corpus/prompt.ts` → `ATS_SYSTEM_PROMPT` (8-section
  format) and `_shared/ai/validate-resume.ts` → `REQUIRED_HEADERS` (order, caps, grounding).
  Change both together — see `AGENTS.md` → Resume Contract Guardrails.
- **Services:** `src/services/index.ts` → `ResumeService` (corpus-related methods)
- **Gate:** `src/components/RequireGoogleDocGate.tsx`

---

## Cover Letters

- **Entry:** `src/pages/CoverLettersPage.tsx`
- **Services:** `src/services/index.ts` → `CoverLetterService`

---

## Applications Tracker

- **Entry:** `src/pages/ApplicationsPage.tsx`
- **Services:** `src/services/index.ts` → `ApplicationService`

---

## Auto-Apply (sends real email)

> ⚠️ **This feature emails employers on the user's behalf via their Gmail account.**
> Treat any change here as user-visible and irreversible. It is **user-triggered only** —
> nothing in the scheduled pipeline sends an application.

- **Entry:** `src/pages/JobsPage.tsx` — bulk "Auto Apply (n)" button (`:478`, handler
  `bulkAutoApply` `:237`); `src/components/jobs/JobDetailDialog.tsx` — per-job extract / preview
  / send (`extractSingleEmail` `:122`, `openApplyPreview` `:144`, `confirmApply` `:166`),
  manual email override (`saveManualEmail` `:195`), preview dialog (`:381`)
- **Eligibility:** `src/utils/job-filters.ts` → `selectApplyableJobs` — requires selected +
  `applyEmail` + `resumeStatus === 'ready'` + `status !== 'applied'`. Unit-tested in
  `job-filters_test.ts`; **this is the gate on sending real email**, so change it with tests.
- **Services:** `src/services/index.ts` → `AutoApplyService` (`services.autoApply`) —
  `extractEmails()`, `apply()`, `getApplyPreview()`, `setApplyEmail()`
- **Backend:** `supabase/functions/auto-apply/index.ts` — composes the email with AI
  (`composeApplyEmail`), attaches the tailored PDF from the `resumes` bucket, sends, records
- **Shared:** `supabase/functions/_shared/apply-email.ts` (email extraction: regex first,
  Gemini fallback), `supabase/functions/_shared/gmail-send.ts` (Gmail API send)
- **Email discovery (two paths):**
  - Inline during discovery — `_shared/workflow/nodes.ts:340` `extractEmailFromText()`,
    persisted at `:874` as `apply_email_source: 'extracted'` (regex only, no AI call)
  - Batch/on-demand — `resume-actions` mode `extract_apply_emails` (`:576`), max 50 jobs
- **OAuth scopes:** `gmail.send` + `gmail.compose`, requested in
  `supabase/functions/google-oauth-start/index.ts:28`. A missing scope surfaces as
  `code: 'gmail_scope_missing'` (`auto-apply/index.ts:317`), detected by
  `isGmailScopeError()` in `src/utils/job-filters.ts` and handled with a "Go to Integrations"
  toast action (`JobsPage.tsx:258`, `JobDetailDialog.tsx:156` and `:185`)
- **Limits:** `MAX_APPLY_PER_REQUEST = 15` (`auto-apply/index.ts:9`); eligibility requires
  `applyEmail && resumeStatus === 'ready' && status !== 'applied'`
  (`src/utils/job-filters.ts` → `selectApplyableJobs`, called at `JobsPage.tsx:227`)
- **Writes:** `jobs.status='applied'`, `jobs.application_status='submitted'`, an `applications`
  row (`apply_method:'email'`, `email_message_id`, `email_subject`, `email_body`), and an
  `application_events` row — `recordApplication()` (`auto-apply/index.ts:137`)
- **DB:** `supabase/migrations/025_auto_apply.sql`
- **Types:** `src/types/index.ts:82-83`

---

## Interview Prep

- **Entry:** `src/components/jobs/JobDetailDialog.tsx` — "Interview Prep" / "View Prep" button
  (`:326`), generator (`generateInterviewPrep` `:105`), section render (`:259`)
- **Also in:** `src/components/jobs/ApplicationPackageWizard.tsx` — opt-in checkbox (`:287`),
  generation (`:131`), results preview (`:325`)
- **Services:** `src/services/index.ts` → `JobSearchService.generateInterviewPrep(jobId)` (`:545`)
- **Backend:** `supabase/functions/resume-actions/index.ts:512` — `mode === 'interview_prep'`;
  loads the job + latest tailored resume, prompts for JSON, persists to `jobs.interview_prep`
- **Shape:** `talkingPoints`, `technicalQuestions`, `behavioralQuestions`, `questionsToAsk`,
  `researchNotes` — `InterviewPrep` in `src/types/index.ts:47`
- **DB:** `supabase/migrations/023_interview_prep.sql`

---

## AI Copilot (Chat)

- **Entry:** `src/pages/CopilotPage.tsx`
- **Services:** `src/services/index.ts` → `ChatService`
- **Backend:** `supabase/functions/ai-chat/index.ts`
- **AI Routing:** `supabase/functions/_shared/ai/router.ts`, `gemini.ts`, `groq.ts`
- **Resume Output Validation:** `supabase/functions/_shared/ai/validate-resume.ts`
- **Usage Tracking:** `supabase/functions/_shared/ai/usage.ts`
- **DB:** `supabase/migrations/017_ai_usage_events.sql`

---

## Workflow Engine & Executions

- **Entry:** `src/pages/ExecutionsPage.tsx`, `src/pages/ExecutionDetailPage.tsx`
- **UI:** `src/components/executions/ExecutionGraph.tsx`, `ExecutionNodeDetailSheet.tsx`, `ExecutionRunLogs.tsx`
- **Services:** `src/services/index.ts` → `WorkflowService`, `ExecutionService`, `AutomationService`
- **Backend:** `supabase/functions/workflow-run/`, `workflow-step/`, `workflow-cancel/`, `workflow-retry-failed/`, `workflow-scheduler/`
- **Engine:** `supabase/functions/_shared/workflow/executor.ts`, `graph.ts`, `nodes.ts`, `run-lifecycle.ts`
- **Run batches (one run per search target):** `supabase/functions/_shared/workflow/run-batch.ts` (+ `run-batch_test.ts`)
- **Job Pipeline (per-job fan-out):** `supabase/functions/_shared/workflow/job-pipeline.ts`, `job-pipeline-slice.ts`
- **Role context helpers:** `supabase/functions/_shared/workflow/role-loop.ts` (read-only accessors; the in-run role loop was replaced by run batches), `supabase/functions/_shared/job-search-roles.ts`
- **Graph provisioning & repair:** `src/services/index.ts` → `ensureDefaultPipeline`, `repairDefaultPipelineGraph`; planner in `src/utils/pipeline-repair.ts` (+ `supabase/functions/_shared/workflow/pipeline-repair_test.ts`)
- **Observability:** `supabase/functions/_shared/workflow/execution-persistence.ts`, `execution-status.ts`
- **Frontend Utils:** `src/utils/execution-graph.ts`, `src/utils/execution.ts`, `src/utils/run-id.ts`
- **Seed Config:** `src/constants/workflow-seed.ts` (+ `supabase/functions/_shared/workflow/seed-graph_test.ts`)
  - `DEFAULT_JOB_SEARCH_WORKFLOW` — the 18-node daily pipeline
  - `DEFAULT_RESUME_TAILOR_WORKFLOW` — a separate 5-node no-scrape graph
    (`Load Job → ATS Optimizer → Build LaTeX → Compile PDF → Upload to Storage`), provisioned by
    `WorkflowService.ensureTailorPipeline()` and started from Job Discovery / Resume Studio
- **DB:** `supabase/migrations/011_execution_observability.sql`, `020_workflow_run_list_indexes.sql`, `023_scheduled_run_slots.sql`, `024_get_run_logs.sql`, `026_run_batches.sql`, `027_workflow_edges_unique.sql`

> **Migration numbering note:** two files share the prefix `023` —
> `023_scheduled_run_slots.sql` (this feature) and `023_interview_prep.sql` (Interview Prep).
> Both apply, since they are ordered lexicographically, but do not add a third `023`.

---

## Shared UI Layer (design system, motion, states)

Cross-cutting frontend infrastructure. Read `AGENTS.md` → Frontend UI & Motion Guardrails
before changing any of it — several of these files encode fixes for specific bugs
(BUG-006, BUG-007).

- **Design tokens:** `src/index.css` — HSL custom properties on `:root` + `.dark`, the
  `.glass`/`.gradient-text`/`grid-bg` component classes, all keyframes, and the global
  `:active` press rule. `--brand-jade` is intentionally *not* overridden in `.dark`.
- **Tailwind token + font registration:** `tailwind.config.js`, `index.html`
  (Inter Tight + JetBrains Mono)
- **Motion primitives:** `src/lib/motion.ts` — `EASE_OUT`/`EASE_IN`, `DURATION`,
  `staggerItem` (clamped by `MAX_STAGGER_INDEX`), `collapseVariants`, `pressable`,
  `useReducedMotion` (preference only) vs `useHeavyMotionEnabled` (GPU cost)
- **Motion components:** `src/components/motion/` — `FadeIn`, `StaggerList`/`StaggerItem`
  (also carries `ul`/`li` semantics and keyboard handling for clickable rows), `AppLoader`,
  `PageLoader`, `InlineLoader`, `IconFrame`, `ScanLineBackground`, `skeletons`
- **Brand:** `src/components/brand/LogoMark.tsx` (icon), `LogoLockup.tsx` (horizontal
  lockup: route graphic + wordmark, theme-adaptive via tokens rather than swapped images);
  static assets `public/favicon.svg`, `apple-touch-icon.svg`, `og-image.svg`
- **Page chrome:** `src/components/shared/PageHeader.tsx` — `PageHeader` (the page's single
  `<h1>`) and `SectionHeading` (the `<h2>` tier); `HeaderActions.tsx` (responsive action row
  with mobile overflow menu)
- **States:** `src/components/shared/EmptyState.tsx` (no data),
  `ErrorState.tsx` (**fetch failed** — never interchangeable with EmptyState),
  `ErrorBoundary.tsx` (render-phase crash; mounted in `AppLayout` and `App.tsx`)
- **Layout shell:** `src/layouts/AppLayout.tsx` (note `<main>` is `overflow-x-hidden`, which
  is why over-wide header rows clip rather than scroll), `src/components/layout/Sidebar.tsx`,
  `Topbar.tsx`, `CommandPalette.tsx`
- **Primitives:** `src/components/ui/` — shadcn/ui generated, **do not hand-edit**

---

## Knowledge Base

- **Entry:** `src/pages/KnowledgeBasePage.tsx`
- **Services:** `src/services/index.ts` → `DocumentService`, `EmbeddingService`
- **Backend:** `supabase/functions/careerpilot-doc-sync/index.ts`
- **DB:** `supabase/migrations/005_knowledge_chunks.sql`

---

## Google Drive Integration

- **Entry:** `src/pages/IntegrationsPage.tsx`
- **Services:** `src/services/index.ts` → `IntegrationService`
- **Backend:** `supabase/functions/google-oauth-start/`, `google-oauth-callback/`, `google-access-token/`
- **Shared:** `supabase/functions/_shared/google-drive.ts`, `google-doc-sync.ts`, `credentials.ts`
- **Utils:** `src/utils/google.ts`

---

## Settings

- **Entry:** `src/pages/SettingsPage.tsx`
- **Tab config:** `SETTINGS_TABS` in `SettingsPage.tsx` — single source of tab order and
  labels. The first two render inline on mobile; the rest collapse into an overflow menu
  below `sm`. Reordering the array changes which stay visible.
- **Deep links:** the active tab is the `?tab=` search param (`profile` clears it). Both the
  `TabsList` and the overflow menu go through one `setSettingsTab` so links keep working.
- **Services:** `src/services/index.ts` → `SettingsService`, `UserService`
- **DB:** `supabase/migrations/001_workflow_engine.sql` (settings RPC)

---

## Analytics

- **Entry:** `src/pages/AnalyticsPage.tsx`
- **Services:** `src/services/index.ts` → `AnalyticsService`

---

## Setup / Onboarding

- **Entry:** `src/pages/SetupPage.tsx`
- **Services:** `src/services/index.ts` → `BootstrapService`
