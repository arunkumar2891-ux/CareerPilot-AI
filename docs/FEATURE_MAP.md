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

---

## Job Discovery

- **Entry:** `src/pages/JobsPage.tsx`
- **UI:** `src/pages/JobsPage.tsx`, `src/components/jobs/JobKanbanBoard.tsx`, `src/components/jobs/PasteJdDialog.tsx`, `src/components/jobs/ApplicationPackageWizard.tsx`
- **Kanban model:** `src/utils/job-kanban.ts` (columns, grouping, optimistic move; drag-and-drop + a keyboard-accessible "Move to" menu)
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

## AI Copilot (Chat)

- **Entry:** `src/pages/CopilotPage.tsx`
- **Services:** `src/services/index.ts` → `ChatService`
- **Backend:** `supabase/functions/ai-chat/index.ts`
- **AI Routing:** `supabase/functions/_shared/ai/router.ts`, `gemini.ts`, `groq.ts`
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
- **DB:** `supabase/migrations/011_execution_observability.sql`, `023_scheduled_run_slots.sql`, `024_get_run_logs.sql`, `026_run_batches.sql`, `027_workflow_edges_unique.sql`

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
