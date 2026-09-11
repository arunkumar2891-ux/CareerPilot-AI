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
| `supabase/functions/_shared/ai/` | AI provider routing, usage tracking, error handling |
| `supabase/functions/_shared/workflow/` | Workflow execution engine, job pipeline, graph traversal |
| `supabase/functions/_shared/career-corpus/` | Resume corpus loading, generation, scoring |
| `supabase/migrations/` | PostgreSQL migrations (024 files) |
| `scripts/` | Build utility scripts |
| `.github/workflows/` | CI/CD (Edge Function deployment) |

## Key Architectural Conventions

- **Single services file:** All frontend-to-backend communication is in `src/services/index.ts` (~2,400 lines). Each service class maps to a domain (jobs, resumes, workflows, etc.).
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
