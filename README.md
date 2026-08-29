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
│  workflow-run · workflow-step · workflow-scheduler│
│  ai-chat · google-oauth-start · google-oauth-cb  │
└──────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  External APIs                                   │
│  Apify · Gemini · Resend · Google Drive · LaTeX  │
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
| **Master ATS Bullet Bank** + **2-Page Template** | Seeded from `src/content/career-corpus` |
| **Role Playbooks** | 6 domain playbooks (fullstack, frontend, backend, data, devops, mobile) |
| **Default Settings** | Job query, location, max jobs, notification email |

### Pipeline Steps

```
Schedule (7 AM daily)
  → Fetch Google Doc header (optional)
  → Build LinkedIn search URL from settings
  → Apify scrape (poll + wait for completion)
  → Parse & limit results
  → Duplicate filter (skip already-seen jobs)
  → For each new job:
      → Select best role playbook via JD keyword matching
      → Gemini ATS tailoring (selects real bullets — never invents metrics)
      → Store job + tailored resume in Supabase
      → Compile LaTeX → PDF
      → Upload PDF to Storage + Google Drive
  → Send email summary via Resend
```

Configure in **Settings → Job Search**. Fill **Profile** contact fields so resumes are complete. Run immediately via **Jobs → Run Search** or wait for the daily schedule.

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
| **Automations** | Cron-scheduled workflow runs (daily job search is pre-created) |
| **Workflow Studio** | Visual DAG builder with 28 node types; inspect or customize the pipeline |
| **AI Agents** | 10 agent types: resume optimizer, ATS analyzer, job matcher, interview coach, and more |

### Resources & Insights
| Module | Description |
|--------|-------------|
| **Documents** | File management with folders, tags, and version history |
| **Knowledge Base** | Career evidence chunks with tag-based retrieval for RAG-style resume tailoring |
| **Analytics** | Job funnel metrics, interview/offer rates, and AI usage tracking |
| **Execution History** | Per-node workflow run logs with timing, inputs, outputs, and errors |

### Configuration
| Module | Description |
|--------|-------------|
| **Integrations** | Google Drive/Docs (OAuth), Apify (API token). Gemini and email configured as Edge Function secrets. |
| **Prompt Library** | Versioned prompt templates with variable substitution and in-app AI testing |
| **Settings** | Profile, job search config, appearance (light/dark/system), notifications, and API key management |

---

## Standalone Workflow Engine

CareerPilot includes a **generic, resumable workflow executor** on Supabase Edge Functions:

- Visual Workflow Studio saves DAGs to `workflow_nodes` / `workflow_edges`
- Resumable execution via `workflow_step_queue` (Apify polling, wait nodes, long-running tasks)
- Scheduled automations via pg_cron → `workflow-scheduler` Edge Function
- 28 node types across 5 categories: triggers, AI, integrations, logic, and data transforms
- Per-item processing with conditional branching, loops, and merge nodes

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
| AI | Google Gemini 1.5 Flash (primary); multi-provider architecture |

---

## Architecture

```
src/
├── App.tsx                        # Root router, auth guard, QueryClient provider
├── layouts/AppLayout.tsx          # Shell (Sidebar + Topbar) + auto-bootstrap on login
├── pages/ (18 pages)              # One page per route
├── components/
│   ├── ui/ (~45 files)            # shadcn/ui primitives (Button, Dialog, Table, etc.)
│   ├── layout/                    # Sidebar, Topbar, CommandPalette
│   └── shared/                    # PageHeader, MetricCard, StatusBadge, EmptyState
├── services/index.ts              # Supabase service layer + BootstrapService
├── constants/workflow-seed.ts     # Built-in pipeline definition (18 nodes, 17 edges)
├── content/career-corpus/         # Master bullet bank, role playbooks, evidence
├── store/index.ts                 # Zustand stores
├── types/index.ts                 # Domain TypeScript interfaces
├── hooks/                         # Custom hooks (use-toast, etc.)
├── lib/                           # supabase.ts, auth.ts, utils.ts
└── utils/index.ts                 # Shared utility functions

supabase/
├── config.toml                    # Local dev config (ports, JWT, functions)
├── migrations/ (5 SQL files)      # Schema, RLS, storage, cron, knowledge chunks
└── functions/
    ├── workflow-run/              # Start a workflow run
    ├── workflow-step/             # Execute/resume a single step
    ├── workflow-scheduler/        # Cron: due automations + wait queue
    ├── ai-chat/                   # LLM gateway (chat, tailoring, ATS scoring)
    ├── google-oauth-start/        # Initiate Google OAuth
    ├── google-oauth-callback/     # Token exchange + credential storage
    ├── google-access-token/       # Token refresh utility
    └── _shared/
        ├── supabase-admin.ts      # Admin/user Supabase clients
        ├── credentials.ts         # Integration credential helpers
        ├── career-corpus/         # Prompt engineering, playbook selection
        └── workflow/              # DAG executor, node registry, graph traversal
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
| `workflow_step_queue` | Resumable async step queue |
| `knowledge_chunks` | Career evidence chunks (tags, collection, content) |
| `integrations` | Third-party connections (credentials column hidden from client) |
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

> **Important:** API keys for Apify, Gemini, Resend, and Google OAuth belong in **Supabase Edge Function secrets**, not in the frontend `.env`. See [DEPLOY.md](DEPLOY.md).

### Database Migrations

Run in the Supabase SQL Editor, in order:

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/001_workflow_engine.sql` | Core schema: all tables, RLS policies, RPCs |
| 2 | `supabase/migrations/002_storage.sql` | `resumes` storage bucket + RLS |
| 3 | Enable `pg_cron` + `pg_net` extensions | Dashboard → Database → Extensions |
| 4 | `supabase/migrations/003_cron.sql` | pg_cron scheduler (edit project ref + secret first) |
| 5 | `supabase/migrations/004_fix_integrations_security.sql` | SECURITY INVOKER for integrations RPC |
| 6 | `supabase/migrations/005_knowledge_chunks.sql` | Career evidence chunks for RAG tailoring |

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
2. **Settings → Job Search** — set query, location, Google Doc resume ID, notification email
3. **Settings → Profile** — fill contact details (used in tailored resumes)
4. **Integrations** — connect Google Drive; add Apify token if not using server-side secret
5. **Jobs → Run Search** — trigger the pipeline immediately
6. **Executions** — monitor per-node progress in real time

---

## Edge Function Secrets

Set via `supabase secrets set` (see [DEPLOY.md](DEPLOY.md)):

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access (bypass RLS) |
| `GEMINI_API_KEY` | AI resume tailoring, chat, ATS scoring |
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

CareerPilot AI uses **Gemini 1.5 Flash** as its primary LLM. The architecture supports multiple providers:

| Provider | Models |
|----------|--------|
| Gemini (active) | gemini-1.5-pro, gemini-1.5-flash |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Claude | claude-3.5-sonnet, claude-3-opus, claude-3-haiku |
| Azure OpenAI | gpt-4o, gpt-35-turbo |
| Ollama (local) | llama3, mistral, phi3 |
| AWS Bedrock | anthropic.claude-3, amazon.titan |

Configure API keys in **Settings → API Keys** or via Edge Function secrets.

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

## Deployment

The frontend is a static SPA deployable to any static host:

| Platform | Config |
|----------|--------|
| **Render** | `render.yaml` (Static Site blueprint) |
| **Vercel** | `vercel.json` (SPA rewrite) |
| **Netlify** | `public/_redirects` |

Backend (Supabase) is managed via the Supabase dashboard or CLI. See **[DEPLOY.md](DEPLOY.md)** for the full end-to-end deployment guide.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |

---

## Known Limitations

- **Google OAuth** requires a Google Cloud project with OAuth consent screen + credentials
- **LaTeX PDF** depends on `latex.ytotech.com` availability (configurable via `LATEX_COMPILER_URL`)
- **pg_cron** must be enabled in Supabase before running migration `003_cron.sql`
- Edge Function timeout (~150s) — long-running tasks use the resumable step queue automatically
- Embedding vectors are architecturally supported but not yet active (knowledge chunks use tag-based retrieval)

---

## Project Structure Summary

```
CareerPilot-AI/
├── index.html                 # SPA entry point
├── package.json               # Dependencies & scripts
├── vite.config.ts             # Vite + React + path aliases
├── tailwind.config.js         # Tailwind theme
├── components.json            # shadcn/ui config
├── vercel.json                # Vercel deployment
├── render.yaml                # Render deployment
├── DEPLOY.md                  # Full deployment guide
├── .env.example               # Required env vars template
├── public/                    # Static assets + SPA redirects
├── src/                       # Frontend source (React + TypeScript)
└── supabase/                  # Backend (migrations + Edge Functions)
```

---

## License

Private project. All rights reserved.
