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
JobsPage (UI) → services.workflow.runWorkflow()
  → supabase.functions.invoke('workflow-run')
    → executor.ts → job-discovery.ts → role-loop.ts → job-pipeline.ts
      → Apify (scraping) → Gemini (scoring) → PostgreSQL (store)
```

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
- `src/components/jobs/PasteJdDialog.tsx` — Manual JD paste dialog
- `src/components/jobs/ApplicationPackageWizard.tsx` — Resume + cover letter generation wizard
- `src/services/index.ts` → `JobSearchService` class
- `supabase/functions/workflow-run/index.ts` — Workflow trigger endpoint
- `supabase/functions/_shared/workflow/job-discovery.ts` — Multi-job discovery seed builder
- `supabase/functions/_shared/workflow/job-pipeline.ts` — Per-job processing pipeline
- `supabase/functions/_shared/workflow/role-loop.ts` — Role-based parallel search loop
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
