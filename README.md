# CareerPilot AI

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-4mtzrxod)

An autonomous AI-powered job search platform that helps you discover roles, tailor resumes, write cover letters, track applications, and automate your entire job hunt — all from a single dashboard.

## Overview

CareerPilot AI is a full-featured React SPA that acts as a **command center for your job search**. It combines job discovery, application tracking, AI-assisted document creation, workflow automation, and conversational AI into one cohesive product.

The app is backed by **Supabase** for authentication, data persistence, and **Edge Functions** that execute workflows server-side (replacing n8n).

## Standalone Workflow Engine

CareerPilot includes a **generic workflow executor** that runs entirely on Supabase Edge Functions:

- Visual Workflow Studio saves graphs to `workflow_nodes` / `workflow_edges`
- **Import n8n Template** seeds the full Apify → Gemini → PDF → email pipeline
- Resumable execution via `workflow_step_queue` (Apify polling, wait nodes)
- Scheduled automations via pg_cron → `workflow-scheduler`

See **[DEPLOY.md](DEPLOY.md)** for setup, API keys, and deployment steps.

## Features

### Overview
| Module | Description |
|--------|-------------|
| **Dashboard** | Real-time metrics, 14-day job/application charts, workflow run history, active agents, and notifications |
| **Job Discovery** | Search and filter jobs with kanban/table views, match scores, salary filters, and job board integration |
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
| **Automations** | Schedule and manage recurring workflow automations with retry support |
| **Workflow Studio** | Visual drag-and-connect builder with 25+ node types (triggers, AI, integrations, logic, data) |
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
| **Integrations** | Connect LinkedIn, Google Drive/Docs, Apify, email, Slack, and more |
| **Prompt Library** | Versioned prompt templates with variable substitution |
| **Settings** | Profile, appearance (light/dark), notifications, billing, security, and API keys |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router 7 |
| Styling | Tailwind CSS 3 + shadcn/ui (New York style) |
| State | Zustand (UI, auth, notifications) |
| Data fetching | TanStack React Query |
| Backend / Auth | Supabase (PostgreSQL + Auth) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Animation | Framer Motion |
| Icons | Lucide React |

## Architecture

```
src/
├── App.tsx                 # Root router, auth guard, providers
├── layouts/
│   └── AppLayout.tsx       # Sidebar + topbar + command palette shell
├── pages/                  # 17 feature pages (one per route)
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── layout/             # Sidebar, Topbar, CommandPalette
│   └── shared/             # PageHeader, MetricCard, StatusBadge, EmptyState
├── services/index.ts       # Supabase-backed service layer (all CRUD + AI stubs)
├── store/index.ts          # Zustand stores (UI, auth, notifications)
├── types/index.ts          # Domain TypeScript interfaces
├── constants/index.ts      # Nav items, AI providers, workflow nodes, statuses
├── lib/
│   ├── supabase.ts         # Supabase client
│   └── utils.ts            # cn() helper (tailwind-merge)
└── utils/index.ts          # Formatting, uid, sleep helpers
```

### Data Flow

1. **Pages** fetch data via TanStack Query, calling methods on the `services` object.
2. **Services** map Supabase rows to typed domain objects and handle business logic.
3. **Zustand** manages client-side state: theme, sidebar, auth session, and notifications.
4. **Protected routes** redirect unauthenticated users to `/auth`.

### Authentication

Supports multiple sign-in methods via Supabase Auth:
- Email + password (sign up / sign in)
- OAuth (Google, GitHub)
- Magic link (OTP)

User profiles are stored in a `profiles` table and auto-created on first login.

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with the required database tables

### Installation

```bash
git clone https://github.com/your-username/CareerPilot-AI.git
cd CareerPilot-AI
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Without these variables the app falls back to placeholder values and database operations will fail.

### Database Schema

The service layer expects the following Supabase tables (with Row Level Security enabled per user):

| Table | Purpose |
|-------|---------|
| `profiles` | User profile, plan, AI credits |
| `jobs` | Discovered job listings with match scores and status |
| `resumes` / `resume_versions` | Resume content and version history |
| `cover_letters` | Cover letter drafts |
| `applications` / `application_events` | Application tracking and timeline |
| `workflows` / `workflow_nodes` / `workflow_edges` | Workflow definitions |
| `workflow_runs` / `workflow_run_nodes` / `workflow_logs` | Execution history |
| `agents` / `agent_runs` | AI agent configs and run logs |
| `documents` / `document_versions` | File storage metadata |
| `prompts` / `prompt_versions` | Prompt templates |
| `notifications` | In-app notifications |
| `integrations` / `integration_logs` | Third-party connections |
| `automations` | Scheduled workflow triggers |
| `chat_conversations` / `chat_messages` | AI Copilot chat history |

### Development

```bash
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # Type-check and production build
npm run preview    # Preview production build
npm run lint       # ESLint
npm run typecheck  # TypeScript check
```

## AI Providers

CareerPilot AI is designed to support multiple LLM backends. Configure API keys in **Settings → API Keys**:

| Provider | Models |
|----------|--------|
| Gemini | gemini-1.5-pro, gemini-1.5-flash |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Claude | claude-3.5-sonnet, claude-3-opus, claude-3-haiku |
| Azure OpenAI | gpt-4o, gpt-35-turbo |
| Ollama | llama3, mistral, phi3 |
| Bedrock | anthropic.claude-3, amazon.titan |

> **Note:** AI features (chat, resume generation, ATS scoring, embeddings, agent runs) require a configured provider. The service layer ships with `UnconfiguredProvider` stubs that throw helpful errors until keys are added.

## Workflow Node Types

The Workflow Studio supports nodes across five categories:

- **Triggers** — schedule, webhook, trigger
- **AI** — gemini, openai, claude, resume_optimizer, cover_letter, prompt
- **Integrations** — http, gdrive, gdocs, apify, linkedin, supabase, email, notification, storage, pdf
- **Logic** — condition, loop, switch, merge, wait
- **Data** — job_search, duplicate_checker, function, transform

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |

## Current Limitations

- **Google OAuth** requires Google Cloud OAuth client + Edge Function secrets
- **LaTeX PDF** depends on `latex.ytotech.com` availability
- **pg_cron** must be configured manually in Supabase (see `supabase/migrations/003_cron.sql`)
- Edge Function timeout (~150s) — long runs use resumable step queue

## License

Private project. All rights reserved.
