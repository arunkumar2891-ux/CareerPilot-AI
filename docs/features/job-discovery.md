# Job Discovery

## Purpose

Automated job searching, scraping, deduplication, AI match scoring, and job management. The core feature of CareerPilot — users configure search criteria and the system finds, scores, and organizes jobs.

## Entry Points

- `/jobs` route → `src/pages/JobsPage.tsx`
- Workflow trigger → `supabase/functions/workflow-run/index.ts`
- Scheduled automation → `supabase/functions/workflow-scheduler/index.ts`

## Flow

### Manual Job Search
```
JobsPage (UI) → services.workflow.ensureDefaultPipeline()   (reconciles the graph)
  → services.execution.runWorkflow()
    → supabase.functions.invoke('workflow-run')
      → createRunBatch()   (one batch per search; one run per search target, linear)
        → executor.ts → job-pipeline.ts (one slice per job)
          → Apify (scraping) → Gemini (ATS + scoring) → PostgreSQL (store)
```

Each search target (role × location, plus an India-remote variant when enabled) becomes its
own workflow run and sends its own summary email. Roles are capped at 5
(`MAX_SEARCH_ROLES`), so a day can produce up to 10 runs and 10 emails.

### Paste JD (single job)
```
PasteJdDialog → services.jobSearch.pasteJd()
  → supabase INSERT into jobs table
```

### Application Package Wizard
```
ApplicationPackageWizard → resume generation + cover letter for a specific job
  → supabase.functions.invoke('resume-actions') + ai-chat
```

## Important Files

- `src/pages/JobsPage.tsx` — Job list, filters, actions, paste JD, application wizard
- `src/components/jobs/JobKanbanBoard.tsx` — Drag-and-drop kanban columns (native HTML5 DnD)
- `src/utils/job-kanban.ts` — Column model, grouping, optimistic status update, move warnings
- `src/components/jobs/PasteJdDialog.tsx` — Manual JD paste dialog
- `src/components/jobs/ApplicationPackageWizard.tsx` — Resume + cover letter generation wizard
- `src/services/index.ts` → `JobSearchService` class
- `supabase/functions/workflow-run/index.ts` — Workflow trigger endpoint
- `supabase/functions/_shared/workflow/job-discovery.ts` — Multi-job discovery seed builder
- `supabase/functions/_shared/workflow/job-pipeline.ts` — Per-job processing pipeline
- `supabase/functions/_shared/workflow/role-loop.ts` — Read-only search-target context accessors (the in-run role loop was replaced by run batches)
- `supabase/functions/_shared/workflow/run-batch.ts` — One workflow run per search target, executed linearly
- `supabase/functions/_shared/job-search-roles.ts` — Search-target building, `MAX_SEARCH_ROLES = 5`
- `supabase/functions/_shared/career-corpus/score.ts` — AI match scoring
- `supabase/functions/_shared/job-dedupe.ts` — URL-based deduplication

## Data Flow

1. User triggers search → workflow created with job search nodes
2. Role loop iterates over configured search roles
3. Apify scrapes job boards (LinkedIn, etc.)
4. Jobs deduplicated by URL
5. AI scores each job against user's master resume
6. Jobs stored in `jobs` table with match scores and status
7. Frontend polls/fetches updated job list

## External Dependencies

- Apify (web scraping API for job boards)
- Gemini AI (match scoring)
- Google Drive (resume PDF storage)

## Common Failure Points

- Apify rate limits or scraping failures
- AI scoring can fail on malformed job descriptions
- URL-based dedup may miss jobs with different URLs for same posting
- Large batch scoring can timeout

## Important Rules

- Jobs go through status progression: `discovered → queued → resume_ready → applied → ...`
- Duplicate detection runs during pipeline, not after
- Match scores can come from different sources (`match_score_source` field)
