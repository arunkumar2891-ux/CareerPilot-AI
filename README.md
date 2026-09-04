# CareerPilot AI

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-4mtzrxod)

An autonomous AI-powered job search platform that discovers roles, tailors resumes, compiles PDFs, uploads to Google Drive, and emails you a daily summary — all without manual intervention.

---

## Overview

CareerPilot AI is a production-ready React SPA that acts as a **command center for your job search**. It combines LinkedIn job discovery, ATS-optimized resume tailoring, application tracking, a visual workflow engine, and conversational AI into one cohesive product.

The backend runs entirely on **Supabase** — PostgreSQL for data, Auth for identity, Storage for PDFs, and **Edge Functions (Deno)** for server-side workflow execution. No external orchestrators (n8n, Zapier, Make) are required.

---

## How It Works

```
┌─────────────┐        ┌───────────────────────────────────────────┐
│  React SPA  │───────▶│  Supabase (Auth · PostgreSQL · Storage)   │
│  (Vite)     │        └───────────────────────────────────────────┘
└──────┬──────┘                          ▲
       │ invoke                          │ service role
       ▼                                 │
┌──────────────────────────────────────────────────┐
│  Supabase Edge Functions (Deno)                  │
│  workflow-run · workflow-step · workflow-scheduler │
│  workflow-cancel · workflow-retry-failed          │
│  ai-chat · google-oauth-start · google-oauth-cb   │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  External APIs                                   │
│  Apify · Gemini · Groq · Resend · Google Drive   │
└──────────────────────────────────────────────────┘
```

---

## Built-in Job Search Pipeline

Every user gets a **pre-provisioned 18-node workflow** on first login — zero setup required.

On sign-in, the app automatically creates:

| Resource | Details |
|----------|---------|
| **Daily Job Search Pipeline** | Full workflow in Workflow Studio |
| **Daily 7 AM Automation** | Active cron schedule (`0 7 * * *`) |
| **Master ATS Bullet Bank** + **2-Page Template** + **6 role banks** (`ATS Bank: …`) | Seeded from `src/content/career-corpus`; ATS picks the bank that matches the job |
| **Role Playbooks** | Integration Architect, GenAI Developer, FDE, Cloud Architect, AI/ML Engineer, Engineering Manager |
| **Default Settings** | Job query, location, posted-within window, max jobs, Google Doc ID, Drive folder ID, notification email |
| **Career Evidence Chunks** | Tagged knowledge chunks for RAG-style resume tailoring |

### Pipeline Steps

```
Schedule (7 AM daily)
  → Sync Google Doc master resume (optional; Settings → Google Doc ID)
  → Build LinkedIn search from Settings (keywords + location + date posted)
  → Apify scrape (explicit keywords/location — not a loose URL search)
  → Parse jobs and drop listings that do not match the search query
  → Limit + duplicate filter
  → For each new job (one Edge Function slice per job):
      → Store job in Supabase
      → Pick role-specific ATS bank from the JD
      → Gemini ATS tailoring (copy/light-edit real bullets; human-like voice)
      → Build LaTeX (NAME, CONTACT, SUMMARY, EXPERIENCE, SKILLS, EDUCATION)
      → Compile PDF
      → Upload to Storage
      → Upload to the Google Drive folder from Settings
        File name: Company_YourName_Role_ddmmyyyy.pdf
  → Email summary via Resend
```

Configure in **Settings → Job Search**. Paste a **Google Doc** link/ID for the master resume and a **Drive folder** link/ID for PDFs — both are stored in settings and can be changed anytime. Fill **Profile** contact + name so PDFs and headers are complete.

**Executions:** live progress, per-job observability, **Stop** (sets `cancelled` and clears the step queue), **Retry Failed Jobs**, delete one run or clear all. Stop persists in the database; an in-flight Gemini call may finish that one job but will not start the next slice.

Aliases like `FDE` expand to `Forward Deployed Engineer` before LinkedIn search.

The workflow definition lives in `src/constants/workflow-seed.ts` and is provisioned by `BootstrapService` in `src/services/index.ts`.

---

## Features

### Dashboard & Discovery
| Module | Description |
|--------|-------------|
| **Dashboard** | Real-time metrics, 14-day trend charts, workflow run history, active agents, and notifications |
| **Job Discovery** | Search and filter jobs with kanban/table views; **Run Search** triggers the pipeline on-demand |
| **Applications** | Full lifecycle tracking with status timelines, recruiters, notes, and attachments |

### Studio
| Module | Description |
|--------|-------------|
| **Resumes** | ATS scoring, version history, and AI-tailored generation per job listing |
| **Cover Letters** | Draft and version cover letters, optionally linked to specific jobs |
| **AI Copilot** | Multi-conversation chat (resume improvement, JD analysis, interview prep, salary negotiation) |

### Automation
| Module | Description |
|--------|-------------|
| **Automations** | Cron-scheduled workflow runs (daily job search is pre-created); clone, pause, toggle |
| **Workflow Studio** | Visual DAG builder with 28 node types; inspect or customize the pipeline |
| **AI Agents** | 10 agent types: resume optimizer, ATS analyzer, job matcher, interview coach, and more |

### Resources & Insights
| Module | Description |
|--------|-------------|
| **Documents** | File management with folders, tags, and version history |
| **Knowledge Base** | Career evidence chunks with tag-based retrieval for RAG-style resume tailoring |
| **Analytics** | Job funnel metrics, interview/offer rates, and AI usage tracking |
| **Execution History** | Live duration, current step, per-job progress with observability; **Stop** a running/zombie run; **Retry Failed Jobs**; delete one or all |

### Configuration
| Module | Description |
|--------|-------------|
| **Integrations** | Add from a catalog of 15+ services (Google Drive/Docs, Apify, OpenAI, Claude, Gemini, Slack, GitHub, SMTP, and more); connect/disconnect, test connections, view sync logs |
| **Prompt Library** | Versioned prompt templates with variable substitution and in-app AI testing |
| **Setup Guide** | Step-by-step onboarding checklist |
| **Settings** | Profile/contact, job search (query, location, posted within, max jobs, Google Doc ID, Drive folder), appearance, notifications |

---

## Standalone Workflow Engine

CareerPilot includes a **generic, resumable workflow executor** on Supabase Edge Functions:

- Visual Workflow Studio saves DAGs to `workflow_nodes` / `workflow_edges`
- Resumable execution via `workflow_step_queue` (Apify polling, wait nodes, **one job per ATS/PDF slice**)
- Stop/cancel writes `workflow_runs.status = cancelled` and deletes queued steps
- Retry failed jobs requeues them for re-execution
- Scheduled automations via pg_cron → `workflow-scheduler` Edge Function
- 28 node types across 5 categories: triggers, AI, integrations, logic, and data transforms
- Per-item processing with conditional branching, loops, and merge nodes
- Execution observability: per-job and per-node execution records with error types, retry counts, and duration tracking

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router DOM 7 |
| Styling | Tailwind CSS 3 + shadcn/ui (New York variant, ~45 primitives) |
| State | Zustand 5 (UI, auth, notifications) |
| Server State | TanStack React Query 5 |
| Backend | Supabase (PostgreSQL 17 + Auth + Storage + Edge Functions) |
| Edge Runtime | Deno (Supabase Edge Functions) |
| Scheduler | pg_cron + pg_net (Postgres extensions) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Animation | Framer Motion |
| Icons | Lucide React |
| PDF | LaTeX → PDF via ytotech.com API |
| Email | Resend |
| Scraping | Apify (LinkedIn Jobs Scraper actor) |
| AI | Google Gemini primary (`gemini-3.6-flash`); Groq fallback (`openai/gpt-oss-120b`) |

---

## Architecture

```
src/
├── App.tsx                        # Root router, auth guard, QueryClient provider
├── layouts/AppLayout.tsx          # Shell (Sidebar + Topbar) + auto-bootstrap on login
├── pages/ (14 pages)              # One page per route
├── components/
│   ├── ui/ (~45 files)            # shadcn/ui primitives (Button, Dialog, Table, etc.)
│   ├── layout/                    # Sidebar, Topbar, CommandPalette
│   ├── shared/                    # PageHeader, MetricCard, StatusBadge, EmptyState
│   └── executions/                # ExecutionGraph, ExecutionNodeDetailSheet
├── services/index.ts              # Supabase service layer + BootstrapService
├── constants/
│   ├── index.ts                   # Navigation, statuses, colors, job boards
│   └── workflow-seed.ts           # Built-in pipeline definition (18 nodes, 17 edges)
├── content/career-corpus/         # Master bullet bank, role playbooks, evidence
├── store/index.ts                 # Zustand stores (UI, auth, notifications)
├── types/index.ts                 # Domain TypeScript interfaces
├── hooks/                         # Custom hooks (use-toast, etc.)
├── lib/                           # supabase.ts, auth.ts, utils.ts
└── utils/                         # cron-schedule, execution-graph, google, index

supabase/
├── config.toml                    # Local dev config (ports, JWT, functions)
├── migrations/ (12 SQL files)     # Schema, RLS, storage, cron, chunks, observability
└── functions/
    ├── workflow-run/              # Start a workflow run (returns immediately; work continues in waitUntil)
    ├── workflow-step/             # Resume due steps (next job slice, Apify wait)
    ├── workflow-scheduler/        # Cron: due automations + wait queue
    ├── workflow-cancel/           # Stop a run (also done from the client + RLS)
    ├── workflow-retry-failed/     # Requeue failed job slices for re-execution
    ├── ai-chat/                   # LLM gateway (chat, tailoring, ATS scoring, Google Doc sync)
    ├── google-oauth-start/        # Initiate Google OAuth (Drive read + write to your folder)
    ├── google-oauth-callback/     # Token exchange + credential storage
    ├── google-access-token/       # Token refresh utility
    └── _shared/
        ├── supabase-admin.ts
        ├── credentials.ts
        ├── ai/                    # Gemini primary + Groq fallback router, timeouts, retries
        ├── google-drive.ts        # Folder/Doc ID parse, PDF file names
        ├── google-doc-sync.ts     # Pull master resume from Google Docs
        ├── resume-latex.ts        # ATS text → moderncv
        ├── career-corpus/         # Playbooks, role banks, prompts
        └── workflow/              # DAG executor, job pipeline slices, cancel, observability
```

### Data Flow

1. **Pages** fetch data via TanStack Query, calling typed methods on the `services` object.
2. **Services** map Supabase rows to domain objects and encapsulate business logic.
3. **BootstrapService** runs on login to ensure the pipeline, automation, corpus, and settings exist.
4. **Edge Functions** execute workflow nodes server-side using credentials from the `integrations` table.
5. **Zustand** manages client-side UI state: theme, sidebar collapse, auth session, notifications.
6. **Protected routes** redirect unauthenticated users to `/auth`.

### Authentication

Supports multiple sign-in methods via Supabase Auth:

- Email + password (sign up / sign in)
- OAuth (Google)
- Magic link (OTP via email)

User profiles are stored in a `profiles` table and auto-created on first login via a database trigger.

---

## Database Schema

Key tables (all protected by Row-Level Security):

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (name, title, email, plan tier, AI credits) |
| `jobs` | Discovered listings (company, role, description, match score, skills, resume status) |
| `resumes` / `resume_versions` | Resume content with versioning and ATS scores |
| `cover_letters` | Generated cover letters linked to jobs |
| `applications` / `application_events` | Application tracker with timeline |
| `workflows` / `workflow_nodes` / `workflow_edges` | DAG-based workflow definitions |
| `workflow_runs` / `workflow_run_nodes` / `workflow_logs` | Execution state and logging |
| `workflow_job_executions` / `workflow_node_executions` | Per-job and per-node observability |
| `workflow_step_queue` | Resumable async step queue |
| `knowledge_chunks` | Career evidence chunks (tags, collection, content) |
| `integrations` / `integration_logs` | Third-party connections (credentials hidden from client) |
| `chat_conversations` / `chat_messages` | AI Copilot history |
| `automations` | Scheduled workflow triggers |
| `prompts` / `prompt_versions` | Versioned prompt templates |
| `agents` / `agent_runs` | AI agent definitions and execution history |
| `documents` / `document_versions` | File metadata and versions |
| `notifications` | In-app and email notifications |
| `settings` | Per-user settings (JSONB) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- API keys: Gemini (required), Apify (for job scraping), Resend (for email)

### Installation

```bash
git clone https://github.com/your-username/CareerPilot-AI.git
cd CareerPilot-AI
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase project values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> **Important:** API keys for Apify, Gemini, Groq, Resend, and Google OAuth belong in **Supabase Edge Function secrets**, not in the frontend `.env`. See [DEPLOY.md](DEPLOY.md).

### Database Migrations

Run in the Supabase SQL Editor, in order:

| # | File | Purpose |
|---|------|---------|
| 1 | `001_workflow_engine.sql` | Core schema: all tables, RLS policies, RPCs |
| 2 | `002_storage.sql` | `resumes` storage bucket + RLS |
| 3 | Enable `pg_cron` + `pg_net` extensions | Dashboard → Database → Extensions |
| 4 | `003_cron.sql` | pg_cron scheduler (edit project ref + secret first) |
| 5 | `004_fix_integrations_security.sql` | SECURITY INVOKER for integrations RPC |
| 6 | `005_knowledge_chunks.sql` | Career evidence chunks for RAG tailoring |
| 7 | `006_knowledge_chunks_source_id.sql` | `source_id` on knowledge chunks |
| 8 | `007_workflow_runs_delete.sql` | Delete own execution history |
| 9 | `008_workflow_runs_cancel.sql` | Update own runs (Stop) + delete step queue |
| 10 | `009_knowledge_chunks_tags.sql` | Tags column on knowledge chunks |
| 11 | `010_workflow_runs_status.sql` | Workflow run status corrections |
| 12 | `011_execution_observability.sql` | Per-job and per-node execution tracking tables |
| 13 | `012_automation_schedule_utc.sql` | Store automation schedules in UTC |

### Development

```bash
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # Type-check + production build
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm run typecheck  # TypeScript check (no emit)
```

### First Run

1. Sign up / log in — the pipeline, automation, and corpus are created automatically
2. **Settings → Profile** — name (used in PDF file names) and contact (resume header)
3. **Settings → Job Search** — query, location, posted within, max jobs, Google Doc resume ID/URL, **Drive folder ID/URL**, notification email
4. **Integrations → Add Integration** — choose from the catalog; connect Google (required to read the Doc and write PDFs into your folder)
5. Add Apify / Gemini / Resend as Edge Function secrets if not already set
6. **Jobs → Run Search** — trigger the pipeline
7. **Executions** — watch per-job slices; **Stop** if a run is stuck; **Retry Failed Jobs** to requeue

---

## Edge Function Secrets

Set via `supabase secrets set` (see [DEPLOY.md](DEPLOY.md)):

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access (bypass RLS) |
| `GEMINI_API_KEY` | Primary AI (resume tailoring, chat, ATS scoring) |
| `GEMINI_MODEL` | Optional; default `gemini-3.6-flash` |
| `GROQ_API_KEY` | Fallback AI if Gemini times out, rate-limits, or is missing |
| `GROQ_MODEL` | Optional; default `openai/gpt-oss-120b` |
| `AI_PRIMARY_PROVIDER` | Optional; default `gemini` |
| `AI_FALLBACK_PROVIDER` | Optional; default `groq` |
| `AI_TIMEOUT_MS` | Optional chat timeout; default `30000` |
| `AI_ATS_TIMEOUT_MS` | Optional ATS/Gemini tailoring timeout; default `75000` |
| `AI_MAX_RETRIES` | Optional; default `1` (do not stack long Gemini retries) |
| `APIFY_TOKEN` | LinkedIn job scraping via Apify actor |
| `RESEND_API_KEY` | Email summaries |
| `RESEND_FROM_EMAIL` | Sender email address |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |
| `APP_URL` | Frontend URL (for OAuth redirects) |
| `LATEX_COMPILER_URL` | PDF generation endpoint (default: `latex.ytotech.com`) |
| `WORKFLOW_SCHEDULER_SECRET` | Authenticate pg_cron → scheduler calls |

---

## AI Providers

CareerPilot AI uses **Gemini** as the primary model (`gemini-3.6-flash` by default) for ATS tailoring, chat, and ATS scoring. **Groq** (`openai/gpt-oss-120b` by default) is used only as a fallback when Gemini times out, returns 429/5xx, or has no API key. Workflow prompts, role-specific ATS banks, and LaTeX/PDF generation are unchanged.

Calls run only in Edge Functions (`supabase/functions/_shared/ai/`). Do not set `VITE_GROQ_API_KEY` or any provider key on the frontend.

| Provider | Notes |
|----------|--------|
| Gemini (primary) | Set `GEMINI_MODEL` to change the model id |
| Groq (fallback) | Set `GROQ_API_KEY` / `GROQ_MODEL`; used after retryable Gemini failures |
| Other node types | `openai` / `claude` nodes use the same AI router |

---

## Workflow Node Types

The Workflow Studio supports **28 node types** across five categories:

| Category | Nodes |
|----------|-------|
| **Triggers** | schedule, webhook, trigger |
| **AI** | gemini, openai, claude, resume_optimizer, cover_letter, prompt |
| **Integrations** | http, gdrive, gdocs, apify, linkedin, supabase, email, notification, storage, pdf |
| **Logic** | condition, loop, switch, merge, wait |
| **Data** | job_search, duplicate_checker, function, transform |

---

## Integrations Catalog

The Integrations page includes a built-in catalog of 15+ services you can add with a few clicks:

| Category | Services |
|----------|----------|
| **Job Boards** | LinkedIn, Indeed, Glassdoor |
| **Email** | Gmail, SMTP |
| **AI Providers** | OpenAI, Anthropic Claude, Google Gemini |
| **Storage** | Google Drive, Supabase |
| **Notifications** | Slack |
| **Scheduling** | Google Calendar |
| **Developer** | GitHub |
| **Scraping** | Apify |
| **Browser** | Chrome Extension |

Each integration has its own credential fields (API key, client ID/secret, webhook URL, etc.). Already-connected services are marked as "Connected" to prevent duplicates.

---

## Deployment

The frontend is a static SPA deployable to any static host:

| Platform | Config |
|----------|--------|
| **Render** | `render.yaml` (Static Site blueprint) |
| **Vercel** | `vercel.json` (SPA rewrite) |
| **Netlify** | `public/_redirects` |

Backend (Supabase) is managed via the Supabase dashboard or CLI. Merges to `main` that change `supabase/functions/**` auto-deploy Edge Functions via GitHub Actions once `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` repo secrets are set. See **[DEPLOY.md](DEPLOY.md)** for the full end-to-end deployment guide.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |

---

## Known Limitations

- **Google OAuth** requires a Google Cloud project with Drive scopes (read docs + write files into a folder you choose). Reconnect after changing scopes.
- **LaTeX PDF** depends on `latex.ytotech.com` availability (configurable via `LATEX_COMPILER_URL`)
- **pg_cron** must be enabled in Supabase before running migration `003_cron.sql`
- Edge Function wall-clock is short (~150s on many plans). The job pipeline **checkpoints after each job** and resumes via `workflow-step` / the scheduler. Do not expect 9 ATS calls in one isolate.
- Embedding vectors are architecturally supported but not yet active (knowledge chunks use tag-based retrieval)
- LinkedIn's AI job search is noisy; we send Apify **keywords + location + datePosted** and post-filter titles/descriptions against your query

---

## License

Private project. All rights reserved.
