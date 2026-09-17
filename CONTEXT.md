# CareerPilot-AI — Project Context

## What It Does

Autonomous AI-powered job search platform. Users connect their resume corpus, configure job search criteria, and the system discovers jobs, scores matches, generates tailored resumes/cover letters, and tracks applications — all via automated workflows running on Supabase Edge Functions.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite, React Router v7 |
| UI | shadcn/ui (Radix + Tailwind CSS), Framer Motion |
| State | Zustand (auth, UI, notifications), TanStack React Query (server state) |
| Backend | Supabase Edge Functions (Deno runtime) |
| Database | Supabase (PostgreSQL + RLS + Storage) |
| AI | Gemini (primary), Groq (secondary) — called from Edge Functions |
| Auth | Supabase Auth (email/password, OAuth, magic link) |
| Integrations | Google Drive/Docs, Apify (job scraping), LinkedIn |
| Deployment | Vercel/Render (SPA static), GitHub Actions (Edge Functions) |

## Architecture

**SPA + Serverless.** The React frontend is a static single-page app. All business logic, AI calls, and external integrations run in Supabase Edge Functions. The frontend communicates via `supabase-js` client (RPC, table queries, and `functions.invoke()`).

Data flow: `React UI → supabase-js → Supabase (PostgREST / Edge Functions) → PostgreSQL / AI APIs / Google Drive`

### Job search: one run per search target

A job search does **not** loop over roles inside a single run. `workflow-run` creates a
**run batch** (`workflow_run_batches`) from the user's search targets and then spawns
**one `workflow_runs` row per target**, strictly one at a time. Each run executes the
pipeline for a single role/location and sends its own summary email.

Linearity is enforced by query (a new target is only spawned when no sibling run is
active), and double-spawning is prevented structurally by a partial unique index on
`(batch_id, batch_index)`. Roles are capped at 5.

### Two levels of fan-out (do not confuse them)

| Level | What it is | Where |
|-------|-----------|-------|
| **Run batch** | One workflow run per search target, executed linearly | `_shared/workflow/run-batch.ts` |
| **Per-job pipeline** | Within one run, one Edge Function invocation per job, to stay under the wall-clock limit | `_shared/workflow/job-pipeline.ts` |

The per-job fan-out runs from the first `insert_job` node until the aggregate node
(`email_summary`). It is the older of the two and is unrelated to roles.

Its first step is `Match Score`, which acts as a **gate**: it scores the job against the
master resume and, unless the score exceeds `settings.jobSearch.minMatchScore` (default 80),
returns a skip output that halts the remaining steps for that job. Gated jobs keep their
score, stay in the `discovered` state, and are still reported in the summary email. Because
`executePerJobPipeline` walks the chain by array index and ignores `result.route`, this gate
is a code-level skip rather than a `true`/`false` edge — see `_shared/workflow/match-gate.ts`.

Job status progression: `discovered` (stored, or gated out) → `queued` (passed the gate /
resume generating) → `resume_ready` (PDF in Storage) → `applied` → …

### The built-in graph is self-healing

`workflow_nodes` / `workflow_edges` rows are per-user data, so users provisioned from an
older seed drift from `src/constants/workflow-seed.ts`. `repairDefaultPipelineGraph`
reconciles them on load using the pure planner in `src/utils/pipeline-repair.ts`:

- Matches nodes by **`type` + `action`/`builtin`**, never by name (names have drifted:
  `Get Resume` → `Sync Google Doc Resume`).
- Restores missing nodes **and** edges, removes retired steps, realigns positions.
- Writes only a **delta**. It must never call `saveGraph`, which deletes and re-inserts
  every node and edge — that caused duplicate-key and statement-timeout failures. See
  `BUG_LOG.md` BUG-003.

Node `positionX` is load-bearing: `src/utils/execution-graph.ts` uses it to split the
shared prefix, the per-job branch, and the fan-in.

## Directory Structure

| Directory | Responsibility |
|-----------|---------------|
| `src/` | Frontend application |
| `src/pages/` | Page-level React components (one per route) |
| `src/components/` | Reusable UI components |
| `src/components/ui/` | shadcn/ui primitives (do not manually edit) |
| `src/services/index.ts` | **All frontend service logic** — single large file, every Supabase call |
| `src/store/index.ts` | Zustand stores (auth, UI, notifications) |
| `src/types/index.ts` | All TypeScript type definitions |
| `src/utils/` | Frontend utilities (execution graph, cron, JD matching, etc.) |
| `src/lib/` | Core library (Supabase client, auth helper, motion config) |
| `src/constants/` | App constants, nav items, workflow seed configs |
| `src/layouts/` | App shell layout (sidebar + topbar + outlet) |
| `src/hooks/` | Custom React hooks |
| `src/content/career-corpus/` | Career corpus constants (master resume name, contact overlay) |
| `supabase/functions/` | Edge Functions (backend) |
| `supabase/functions/_shared/` | Shared backend utilities (AI, workflow engine, resume, Google Drive) |
| `supabase/functions/_shared/ai/` | AI provider routing, resume output validation, usage tracking, error handling |
| `supabase/functions/_shared/workflow/` | Workflow execution engine, job pipeline, graph traversal |
| `supabase/functions/_shared/career-corpus/` | Resume corpus loading, generation, scoring |
| `supabase/migrations/` | PostgreSQL migrations (through `027`) |
| `scripts/` | Build utility scripts |
| `.github/workflows/` | CI/CD (Edge Function deployment) |

## Key Architectural Conventions

- **Single services file:** All frontend-to-backend communication is in `src/services/index.ts` (~2,500 lines). Each service class maps to a domain (jobs, resumes, workflows, etc.).
- **Single types file:** All TypeScript interfaces/types are in `src/types/index.ts`.
- **Page = feature:** Each page in `src/pages/` is a self-contained feature entry point.
- **Edge Functions = backend API:** Named functions in `supabase/functions/` with shared logic in `_shared/`.
- **RLS everywhere:** All database access uses Row Level Security; admin operations use `createAdminClient()`.
- **No server-side rendering:** Pure SPA with client-side routing.

## Do Not Modify

- `src/components/ui/` — Auto-generated shadcn/ui components
- `supabase/migrations/` — Applied database migrations (append-only)
- `package-lock.json`, `deno.lock` — Auto-generated lockfiles
- `dist/` — Build output
- `components.json` — shadcn/ui config

## Feature Map

See `docs/FEATURE_MAP.md` for detailed feature-to-file mappings.

## Known-Good States

`RESTORE_POINTS.md` records verified-working versions, what was validated, and how to roll
back. Add an entry whenever a release is confirmed working end-to-end.

## Bug History

`BUG_LOG.md` records resolved bugs with root cause and validation. Read BUG-003 before
touching workflow graph provisioning — it explains why the repair writes deltas instead of
rewriting the graph.
