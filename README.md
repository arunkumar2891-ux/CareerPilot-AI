# CareerPilot AI

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-4mtzrxod)

CareerPilot AI is a full-stack job-search workspace. It discovers LinkedIn roles, creates job-specific resumes, tracks applications, and runs a resumable automation pipeline from a React dashboard.

The frontend is a Vite single-page application. Supabase supplies authentication, PostgreSQL, storage, and Deno Edge Functions; no external workflow orchestrator is required.

## What it does

- Finds LinkedIn jobs through an Apify actor and filters duplicates.
- Uses your master resume (or a matching role-specific resume) plus the job description to tailor a human-sounding resume.
- Produces a PDF with LaTeX, stores it in Supabase Storage, and can sync it to Google Drive from the Resume workspace.
- Tracks jobs and applications, including status timelines, notes, and attachments.
- Scores resumes for ATS compatibility, persists the feedback with the resume, and opens a resume-linked Copilot conversation for follow-up improvements.
- Provides an AI Copilot, cover-letter drafting, analytics, an integrations catalog, and a knowledge base.
- Runs scheduled searches and exposes run, job, and node-level execution history, with cancellation and retry of failed jobs.

## Architecture

```text
React + Vite SPA
        │
        ▼
Supabase Auth / PostgreSQL / Storage / RLS
        │
        ▼
Supabase Edge Functions
  workflow-run · workflow-step · workflow-scheduler
  ai-chat · resume-actions · Google OAuth helpers
        │
        ▼
Apify · Gemini (primary) · Groq (fallback) · Resend · Google APIs · LaTeX compiler
```

The client uses React Router, TanStack Query, Zustand, Tailwind CSS, shadcn/ui, and Framer Motion. Server-side operations are implemented in TypeScript/Deno Edge Functions, keeping provider keys out of the browser.

## UI and motion system

The dashboard uses a **Mission Control Premium** visual language: restrained cyan accents, tight glow shadows, mono status labels, and orbital loaders — not heavy blur or particle effects. Motion is centralized so pages stay consistent and accessible.

### Design tokens

| Location | Contents |
| --- | --- |
| [`src/lib/motion.ts`](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/src/lib/motion.ts) | Shared easing (`EASE_OUT`), durations, page transitions, stagger variants, `useReducedMotion()` |
| [`src/index.css`](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/src/index.css) | `grid-bg`, `gradient-text`, `status-label`, `glow-border`, `animate-shimmer`, `animate-orbit`, `animate-scan`, `animate-status-pulse` |
| [`tailwind.config.js`](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/tailwind.config.js) | `shadow-glow-sm`, `shadow-glow-primary` |

Primary entrances use opacity + a short `y` translate (~450ms, decelerate easing). `prefers-reduced-motion` and mobile viewports disable orbit/scan animations and page transitions.

### Brand

[`src/components/brand/LogoMark.tsx`](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/src/components/brand/LogoMark.tsx) is a custom SVG (trajectory arc + node). It replaces the generic rocket icon in the sidebar, auth screen, Copilot header, setup guide, and boot loader. Lucide icons remain for navigation and actions.

### Motion kit (`src/components/motion/`)

| Component | Role |
| --- | --- |
| `AppLoader` | Full-screen boot loader (orbital rings + cycling status text) — used in `ProtectedRoute` |
| `PageLoader` | Centered or overlay loading for execution detail and workflow graph |
| `InlineLoader` | Button/action spinner — replaces raw `Loader2` / `RefreshCw` spinners app-wide |
| `StaggerList` / `StaggerItem` | Standard list and card entrance choreography |
| `FadeIn` | Single-element fade-up (page headers, chat bubbles, settings tabs) |
| `ScanLineBackground` | Subtle HUD scan line over the auth grid |
| `IconFrame` | Consistent glowing icon container (empty states) |
| `SkeletonCard` / `SkeletonMetricGrid` / `SkeletonTable` | Shimmer loading placeholders wired to corpus, resumes, jobs, and metrics |

Import from `@/components/motion` or use shared components (`PageHeader`, `MetricCard`, `EmptyState`) that already compose these primitives.

### Where motion is applied

- **Layout:** Sidebar active-link glow bar, Copilot nav pulse ring, topbar command-palette hover glow, notification bell pulse, refined route transitions in `AppLayout`
- **Shared:** `StatusBadge` glow for running/generating states, `ExecutionGraph` orbital mini-loader on active nodes
- **Pages:** All 15 routed pages use the motion kit for loading states, list entrances, or section fades (Dashboard through Settings, including Auth)

## Job-search pipeline

On first authenticated load, `BootstrapService` provisions default settings, the workflow, and a daily automation. Add a master resume on the Corpus page (Google Doc, upload, or paste) before tailoring. The current default workflow has 17 nodes:

```text
Daily schedule
  → optional Google Doc resume sync
  → build LinkedIn query
  → start and poll Apify scrape
  → fetch and parse results
  → limit and de-duplicate jobs
  → store job
  → ATS optimization
  → build LaTeX and compile PDF
  → store PDF
  → assemble and send summary email
```

Long-running work is checkpointed in `workflow_step_queue`. The scheduler resumes Apify polling, waiting nodes, and queued job slices, which keeps a multi-job run within Edge Function execution limits. A user can cancel a run or retry failed job slices from Execution History.

The default workflow definition is in [src/constants/workflow-seed.ts](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/src/constants/workflow-seed.ts). The workflow can be customized through the data model; the available node types cover triggers, AI, integrations, logic, and transforms.

## Resume review and Copilot

The Resume workspace keeps the latest ATS review alongside the Markdown resume. Select **Score ATS** to generate a score, specific feedback, and actionable suggestions; the review is saved in the `resumes.ats_review` column, so it is available when the resume is reopened.

From the **ATS Review** tab, **Discuss in Copilot** opens (or resumes) a conversation linked to that resume. The Copilot receives the current resume and saved review as context, retains its conversation history, and is instructed not to invent experience, metrics, skills, certifications, employers, or dates. It asks for missing facts before proposing Markdown edits; changes remain user-reviewed and are not applied automatically.

This flow requires migration `018_resume_ats_review_chat.sql` and the deployed `ai-chat` Edge Function. General Copilot conversations continue to work without a linked resume.

## Application areas

| Area | Purpose |
| --- | --- |
| Dashboard | Metrics, trends, notifications, and recent activity |
| Job Discovery | Search results, filtering, and on-demand pipeline runs |
| Applications | Application status, events, recruiter details, notes, and files |
| Corpus | Master resume and optional role-specific resumes (Google Doc, upload, or paste) |
| Resumes | Markdown editing, persisted ATS reviews, versions, PDF generation, and Google Drive sync |
| Cover Letters and AI Copilot | Drafting, resume/JD assistance, ATS-review follow-up, interview preparation, and saved chat history |
| Knowledge Base | Google Doc sync and tagged career-evidence retrieval |
| Execution History | Workflow graph, logs, per-job/node outcomes, cancellation, and retries |
| Analytics | Funnel metrics and AI usage |
| Integrations and Settings | Third-party connections, profile/contact data, queries, schedules, and notifications |

## Repository layout

```text
src/
  pages/                       Routed product pages (motion kit applied on all 15 routes)
  components/
    brand/                     LogoMark SVG
    motion/                    AppLoader, loaders, stagger, fade, skeletons
    layout/                    Sidebar, Topbar, CommandPalette
    shared/                    PageHeader, MetricCard, EmptyState, StatusBadge
    resume/ execution/ ui/     Feature and shadcn primitives
  services/index.ts            Typed Supabase-facing service layer and bootstrap logic
  content/career-corpus/       Master resume name constants and contact overlay helpers
  constants/workflow-seed.ts   Default workflows (daily pipeline + resume tailoring)
  lib/
    motion.ts                  Motion tokens and useReducedMotion
    supabase.ts                Supabase client and auth helpers
  store/                       Zustand stores

supabase/
  migrations/                  Ordered schema, RLS, storage, scheduler, and feature migrations
  functions/                   Deno Edge Functions and shared workflow/AI helpers

scripts/
  bump-version.mjs             Increments package.json version before deploy
```

## Prerequisites

- Node.js 18 or later
- A Supabase project
- Gemini API key for AI functionality
- Apify token for the automated LinkedIn search
- Resend API key for email summaries
- Google OAuth credentials only if using Google Docs or Drive

## Local development

Install dependencies and create a local frontend environment file:

```bash
npm install
```

Create `.env` with only the public Supabase values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then run the application:

```bash
npm run dev        # http://localhost:5173
npm run lint       # ESLint
npm run typecheck  # TypeScript, no emit (run after UI/motion changes)
npm run build      # type-check, then Vite production build
npm run preview    # serve the production build

npm run version:bump  # 1.0 -> 1.1 -> ... -> 1.999 -> 2.0; run before each deploy
```

The sidebar shows the current version as `beta v1` (sourced from `version` in `package.json`).

Do not put provider API keys in `.env` or expose them through `VITE_` variables. Configure those as Supabase Edge Function secrets instead.

## Supabase setup

Apply every SQL migration in filename order. Before `003_cron.sql`, enable the `pg_cron` and `pg_net` extensions. Migration `003` contains placeholders for the project reference and scheduler secret; replace them before running it.

| Range | Scope |
| --- | --- |
| `001`–`004` | Workflow engine, resume storage, scheduler, and integrations security |
| `005`–`010` | Career knowledge chunks, execution deletion/cancellation, and status support |
| `011`–`013` | Execution observability and automation scheduling repairs |
| `014`–`016` | Resume-to-job links, PDF/Drive fields, and corpus classification |
| `017` | AI usage events |
| `018` | Persisted ATS reviews and resume-linked Copilot conversations |
| `019` | `corpus_type` / `corpus_source` plus DOCX uploads in the resumes bucket |

For exact migration and scheduler instructions, see [DEPLOY.md](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/DEPLOY.md). The deployment guide is especially important for the cron endpoint, because scheduled and waiting workflows require `workflow-scheduler` to run every minute.

### Edge Function secrets

Set the secrets needed by the features you enable, for example:

```bash
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  GEMINI_API_KEY=your_gemini_key \
  APIFY_TOKEN=your_apify_token \
  RESEND_API_KEY=your_resend_key \
  RESEND_FROM_EMAIL='CareerPilot <onboarding@resend.dev>' \
  WORKFLOW_SCHEDULER_SECRET=your_random_secret \
  APP_URL=http://localhost:5173
```

Optional configuration includes:

| Secret | Use |
| --- | --- |
| `GEMINI_MODEL` | Overrides the primary Gemini model (default: `gemini-3.6-flash`) |
| `GROQ_API_KEY`, `GROQ_MODEL` | Enables the Groq fallback (default model: `openai/gpt-oss-120b`) |
| `GEMINI_API_KEY` | Primary Gemini account |
| `GEMINI_API_KEY_FALLBACK` | Second Gemini account (used when primary is rate-limited) |
| `GROQ_API_KEY` | Third fallback after both Gemini keys |
| `AI_TIMEOUT_MS`, `AI_ATS_TIMEOUT_MS`, `AI_MAX_RETRIES` | Adjusts AI timeouts and retries |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Docs/Drive OAuth |
| `DEPLOY_SYNC_SECRET` | Authenticates the deploy-triggered CareerPilot Google Doc sync |
| `LATEX_COMPILER_URL` | Overrides the PDF compiler endpoint |

Deploy all functions after setting secrets:

```bash
supabase functions deploy --project-ref YOUR_PROJECT_REF
```

The repository also includes a GitHub Actions workflow that deploys Edge Functions after relevant changes land on `main`; it requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` repository secrets. See [`.github/workflows/deploy-supabase-functions.yml`](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/.github/workflows/deploy-supabase-functions.yml).

## First-run checklist

1. Sign up or sign in. The bootstrap service creates the default workflow, daily automation, and starter settings.
2. In **Settings**, add your profile/contact data and configure the search query, location, posted-within window, maximum jobs, and notification email.
3. Connect Google in **Integrations** if you want to pull a master Google Doc or send generated PDFs to Drive.
4. On **Corpus**, add your master resume (Google Doc, PDF/DOCX/MD upload, or paste). Optional role-specific resumes are matched to jobs by title.
5. Use **Job Discovery → Run Search** to test the pipeline, then follow progress in **Execution History**.
6. Open a resume, select **Score ATS**, and use **Discuss in Copilot** to work through its saved review.

## Career corpus

The corpus is per-user data in Supabase — not files in this repo. Google Doc sync or a direct upload is the source of truth for the master resume. Role-specific resumes are optional overrides used when the job title matches.

Resume tailoring sends the selected source resume and the job description to Gemini with a 7-section output contract (NAME, CONTACT, SUMMARY, SKILLS, PROFESSIONAL EXPERIENCE, CERTIFICATION, EDUCATION). Output is validated for section shape, length, source grounding of experience bullets, and human voice (banned AI cliches).

## Deployment

The frontend is a static Vite application and includes host configuration for Render, Vercel, and Netlify-style redirects:

- [render.yaml](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/render.yaml) for Render Static Sites
- [vercel.json](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/vercel.json) for Vercel SPA rewrites
- [public/_redirects](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/public/_redirects) for Netlify-compatible hosts

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the static host, update `APP_URL` in Supabase secrets to the deployed URL, and add that URL to Supabase Auth redirect settings.

## Notes and limits

- UI motion honors `prefers-reduced-motion`; orbital loaders fall back to static rings and page transitions are skipped on mobile.
- Google Docs and Drive features require a Google Cloud OAuth client with the requested scopes and a connected user account.
- PDFs depend on the configured LaTeX compiler service.
- ATS scoring and resume-linked Copilot use the configured AI provider; quality depends on the supplied resume content and should be reviewed before use.
- `pg_cron`/`pg_net`, or an equivalent external minute-level scheduler, is required for scheduled runs and delayed workflow steps. Manual runs do not depend on cron.
- Knowledge-base embeddings are represented in the schema, while the current retrieval path is tag/evidence based.
- LinkedIn scraping results are subject to Apify actor output and can be noisy; the workflow filters using the configured query and URL de-duplication.

## License

Private project. All rights reserved.
