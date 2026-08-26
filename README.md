# CareerPilot AI

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-4mtzrxod)

An autonomous AI-powered job search platform that helps you discover roles, tailor resumes, write cover letters, track applications, and automate your entire job hunt — all from a single dashboard.

## Overview

CareerPilot AI is a full-featured React SPA that acts as a **command center for your job search**. It combines job discovery, application tracking, AI-assisted document creation, workflow automation, and conversational AI into one cohesive product.

The app is backed by **Supabase** for authentication, data persistence, storage, and **Edge Functions** that execute workflows server-side. No external workflow tools (n8n, Zapier, etc.) are required.

## Built-in Job Search Pipeline

Every user gets a **pre-provisioned workflow** on first login — no import or setup step required.

On sign-in, the app automatically creates:

| Resource | Details |
|----------|---------|
| **Daily Job Search Pipeline** | Full workflow in Workflow Studio |
| **Daily 7 AM Job Search** | Active automation (`0 7 * * *`) |
| **Master ATS (bullet bank)** + **2-page template** | Seeded from `src/content/career-corpus` |
| **Default settings** | Job query, location, max jobs, notification email |

### Pipeline steps

```
Schedule (7 AM)
  → Optional Google Doc header
  → Build LinkedIn search URL
  → Apify scrape (poll + wait)
  → Parse & limit jobs
  → Duplicate filter
  → Gemini ATS (selects from Master ATS corpus + role playbook)
  → Store in Supabase
  → LaTeX → PDF compile
  → Upload (Storage + Google Drive)
  → Email summary (Resend)
```

Configure search in **Settings → Job Search**. Fill **Profile** contact fields so tailored resumes are not placeholders. Google Docs is optional. Run immediately via **Jobs → Run Search** or wait for the daily schedule. Tailoring **selects** bullets from the Master ATS corpus — it does not invent metrics.

The workflow definition lives in `src/constants/workflow-seed.ts` and is provisioned by `BootstrapService` in `src/services/index.ts`.

## Standalone Workflow Engine

CareerPilot includes a **generic workflow executor** on Supabase Edge Functions:

- Visual Workflow Studio saves graphs to `workflow_nodes` / `workflow_edges`
- Resumable execution via `workflow_step_queue` (Apify polling, wait nodes)
- Scheduled automations via pg_cron → `workflow-scheduler`
- 25+ node types: triggers, AI, integrations, logic, and data transforms

See **[DEPLOY.md](DEPLOY.md)** for migrations, API keys, Edge Function secrets, and deployment.

## Features

### Overview
| Module | Description |
|--------|-------------|
| **Dashboard** | Real-time metrics, 14-day job/application charts, workflow run history, active agents, and notifications |
| **Job Discovery** | Search and filter jobs with kanban/table views; **Run Search** triggers the built-in pipeline |
| **Applications** | Track application status, timelines, recruiters, notes, and attachments |

### Studio
| Module | Description |
|--------|-------------|
| **Resumes** | Create and manage resumes with ATS scoring, versioning, and job-tailored generation |
| **Cover Letters** | Draft and version cover letters, optionally linked to specific jobs |
| **AI Copilot** | Chat interface for resume improvement, JD analysis, interview prep, career advice, and more |

### Automate
| Module | Description |
|--------|-------------|
| **Automations** | Manage scheduled workflow runs (daily job search is pre-created) |
| **Workflow Studio** | Visual drag-and-connect builder; inspect or customize the built-in pipeline |
| **AI Agents** | Configure autonomous agents (resume optimizer, ATS analyzer, job matcher, interview coach, etc.) |

### Resources & Insights
| Module | Description |
|--------|-------------|
| **Documents** | File management with folders, tags, and version history |
| **Knowledge Base** | Semantic search over embedded document chunks |
| **Analytics** | Job funnel metrics, interview/offer rates, and AI usage tracking |
| **Execution History** | Workflow run logs with per-node results and debug output |

### Configure
| Module | Description |
|--------|-------------|
| **Integrations** | Apify (job scrape) and optional Google Drive (PDF upload). Gemini and email are Edge Function secrets. |
| **Prompt Library** | Versioned prompt templates with variable substitution |
| **Settings** | Profile, job search config, appearance (light/dark), notifications, and API keys |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router 7 |
| Styling | Tailwind CSS 3 + shadcn/ui (New York style) |
| State | Zustand (UI, auth, notifications) |
| Data fetching | TanStack React Query |
| Backend / Auth | Supabase (PostgreSQL + Auth + Storage) |
| Workflow runtime | Supabase Edge Functions (Deno) |
| Scheduler | pg_cron + pg_net |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Animation | Framer Motion |
| Icons | Lucide React |

## Architecture

```
src/
├── App.tsx                     # Root router, auth guard, providers
├── layouts/AppLayout.tsx       # Shell + auto-bootstrap on login
├── pages/                      # Feature pages (one per route)
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   ├── layout/                 # Sidebar, Topbar, CommandPalette
│   └── shared/                 # PageHeader, MetricCard, StatusBadge, EmptyState
├── services/index.ts           # Supabase service layer + BootstrapService
├── constants/workflow-seed.ts  # Built-in job search pipeline definition
├── store/index.ts              # Zustand stores (UI, auth, notifications)
├── types/index.ts              # Domain TypeScript interfaces
└── lib/                        # Supabase client, auth helpers

supabase/
├── migrations/                 # SQL schema (001–004)
├── functions/
│   ├── workflow-run/           # Start a workflow run
│   ├── workflow-step/          # Execute/resume a single step
│   ├── workflow-scheduler/     # Cron: due automations + wait queue
│   ├── ai-chat/                # Copilot streaming chat
│   ├── google-oauth-start/     # Google OAuth flow
│   ├── google-oauth-callback/
│   └── _shared/workflow/       # Executor, node registry, graph traversal
└── config.toml
```

### Data flow

1. **Pages** fetch data via TanStack Query, calling methods on the `services` object.
2. **Services** map Supabase rows to typed domain objects and handle business logic.
3. **BootstrapService** runs on login to ensure workflow, automation, and default settings exist.
4. **Edge Functions** execute workflow nodes server-side with user credentials from integrations.
5. **Zustand** manages client-side state: theme, sidebar, auth session, and notifications.
6. **Protected routes** redirect unauthenticated users to `/auth`.

### Authentication

Supports multiple sign-in methods via Supabase Auth:

- Email + password (sign up / sign in)
- OAuth (Google, GitHub)
- Magic link (OTP)

User profiles are stored in a `profiles` table and auto-created on first login.

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with migrations applied (see [DEPLOY.md](DEPLOY.md))

### Installation

```bash
git clone https://github.com/your-username/CareerPilot-AI.git
cd CareerPilot-AI
npm install
```

### Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> **Important:** API keys for Apify, Gemini, Resend, and Google OAuth belong in **Supabase Edge Function secrets**, not in the frontend `.env`. See [DEPLOY.md](DEPLOY.md).

### Database migrations

Run in the Supabase SQL Editor, in order:

1. `supabase/migrations/001_workflow_engine.sql`
2. `supabase/migrations/002_storage.sql`
3. Enable `pg_cron` and `pg_net` extensions (Dashboard → Database → Extensions)
4. `supabase/migrations/003_cron.sql` (edit project ref and scheduler secret first)
5. `supabase/migrations/004_fix_integrations_security.sql`

### Development

```bash
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # Type-check and production build
npm run preview    # Preview production build
npm run lint       # ESLint
npm run typecheck  # TypeScript check
```

### First run (local)

1. Sign up / log in — workflow and automation are created automatically
2. **Settings → Job Search** — set query, location, Google Doc resume ID, notification email
3. **Integrations** — connect Google; add Apify if not using server-side `APIFY_TOKEN` secret
4. **Jobs → Run Search** — trigger the pipeline immediately
5. **Executions** — monitor per-node progress

## Edge Function secrets

Set via `supabase secrets set` (see [DEPLOY.md](DEPLOY.md)):

| Secret | Purpose |
|--------|---------|
| `APIFY_TOKEN` | LinkedIn job scraping |
| `GEMINI_API_KEY` | ATS resume optimization |
| `RESEND_API_KEY` | Email summaries |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Drive/Docs OAuth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access |
| `WORKFLOW_SCHEDULER_SECRET` | Authenticate cron → scheduler |
| `APP_URL` | OAuth redirect base URL |
| `LATEX_COMPILER_URL` | PDF generation (default: latex.ytotech.com) |

## AI providers

CareerPilot AI supports multiple LLM backends. Configure API keys in **Settings → API Keys** or via Edge Function secrets:

| Provider | Models |
|----------|--------|
| Gemini | gemini-1.5-pro, gemini-1.5-flash |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Claude | claude-3.5-sonnet, claude-3-opus, claude-3-haiku |
| Azure OpenAI | gpt-4o, gpt-35-turbo |
| Ollama | llama3, mistral, phi3 |
| Bedrock | anthropic.claude-3, amazon.titan |

## Workflow node types

The Workflow Studio supports nodes across five categories:

- **Triggers** — schedule, webhook, trigger
- **AI** — gemini, openai, claude, resume_optimizer, cover_letter, prompt
- **Integrations** — http, gdrive, gdocs, apify, linkedin, supabase, email, notification, storage, pdf
- **Logic** — condition, loop, switch, merge, wait
- **Data** — job_search, duplicate_checker, function, transform

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |

## Current limitations

- **Google OAuth** requires Google Cloud OAuth client + Edge Function secrets
- **LaTeX PDF** depends on `latex.ytotech.com` availability (or your own `LATEX_COMPILER_URL`)
- **pg_cron** must be enabled in Supabase before running `003_cron.sql`
- Edge Function timeout (~150s) — long runs use the resumable step queue

## License

Private project. All rights reserved.
