# CareerPilot AI

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-4mtzrxod)

CareerPilot AI is a full-stack job-search workspace. It discovers LinkedIn roles, creates job-specific resumes, tracks applications, and runs a resumable automation pipeline from a React dashboard.

The frontend is a Vite single-page application. Supabase supplies authentication, PostgreSQL, storage, and Deno Edge Functions; no external workflow orchestrator is required.

## What it does

- Finds LinkedIn jobs through an Apify actor and filters duplicates.
- Uses a career corpus, role playbooks, and tagged evidence to tailor resumes for a job description.
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

The client uses React Router, TanStack Query, Zustand, Tailwind CSS, and shadcn/ui components. Server-side operations are implemented in TypeScript/Deno Edge Functions, keeping provider keys out of the browser.

## Job-search pipeline

On first authenticated load, `BootstrapService` provisions default settings, career-corpus records, the workflow, and a daily automation. The current default workflow has 17 nodes:

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
| Corpus | Seeded master resume, two-page template, and role-specific bullet banks |
| Resumes | Markdown editing, persisted ATS reviews, versions, PDF generation, and Google Drive sync |
| Cover Letters and AI Copilot | Drafting, resume/JD assistance, ATS-review follow-up, interview preparation, and saved chat history |
| Knowledge Base | Google Doc sync and tagged career-evidence retrieval |
| Execution History | Workflow graph, logs, per-job/node outcomes, cancellation, and retries |
| Analytics | Funnel metrics and AI usage |
| Integrations and Settings | Third-party connections, profile/contact data, queries, schedules, and notifications |

## Repository layout

```text
src/
  pages/                       Routed product pages
  components/                  Layout, shared, resume, execution, and UI components
  services/index.ts            Typed Supabase-facing service layer and bootstrap logic
  content/career-corpus/       Resume source material, role playbooks, and evidence chunks
  constants/workflow-seed.ts   Default 17-node workflow
  lib/                         Supabase client and auth helpers
  store/                       Zustand stores

supabase/
  migrations/                  Ordered schema, RLS, storage, scheduler, and feature migrations
  functions/                   Deno Edge Functions and shared workflow/AI helpers

scripts/
  sync-careerpilot-section.mjs Bundles the CareerPilot resume section for Edge Functions
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
npm run typecheck  # TypeScript, no emit
npm run build      # sync corpus, type-check, then Vite production build
npm run preview    # serve the production build
```

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

1. Sign up or sign in. The bootstrap service creates the default workflow, daily automation, corpus, and starter settings.
2. In **Settings**, add your profile/contact data and configure the search query, location, posted-within window, maximum jobs, and notification email.
3. Connect Google in **Integrations** if you want to pull a master Google Doc or send generated PDFs to Drive.
4. Use **Knowledge Base** to sync a Google Doc into the corpus if applicable.
5. Use **Job Discovery → Run Search** to test the pipeline, then follow progress in **Execution History**.
6. Open a resume, select **Score ATS**, and use **Discuss in Copilot** to work through its saved review.

## Career corpus

`src/content/career-corpus/` is the versioned source for resume-safe seed data: the master resume, two-page template, role playbooks, ATS keywords, and evidence chunks. When the CareerPilot project block in `master-resume.md` changes, run:

```bash
npm run sync:corpus
```

This regenerates `supabase/functions/_shared/career-corpus/careerpilot-section.generated.ts`, which is used by the Edge Functions and included automatically by `npm run build`.

### Source-locked resume tailoring

Resume tailoring uses hybrid retrieval without treating the job description as a source of candidate facts. A role playbook first selects a relevant master-resume bank, then lexical matching finds additional master-resume blocks that overlap with the job description. Evidence chunks and the posting influence selection only.

The final resume is source-locked: every non-heading output line must match a line in the user's Master ATS resume, and the response must contain each required section exactly once. Outputs with unsupported lines or duplicate source lines are rejected before they are stored. This deliberately favors factual consistency over free-form rewriting; update the Master ATS resume when a fact, metric, or skill should become eligible for tailoring.

## Deployment

The frontend is a static Vite application and includes host configuration for Render, Vercel, and Netlify-style redirects:

- [render.yaml](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/render.yaml) for Render Static Sites
- [vercel.json](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/vercel.json) for Vercel SPA rewrites
- [public/_redirects](/Users/arunkumarjs/Documents/GitHub/CareerPilot-AI/public/_redirects) for Netlify-compatible hosts

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the static host, update `APP_URL` in Supabase secrets to the deployed URL, and add that URL to Supabase Auth redirect settings.

## Notes and limits

- Google Docs and Drive features require a Google Cloud OAuth client with the requested scopes and a connected user account.
- PDFs depend on the configured LaTeX compiler service.
- ATS scoring and resume-linked Copilot use the configured AI provider; quality depends on the supplied resume content and should be reviewed before use.
- `pg_cron`/`pg_net`, or an equivalent external minute-level scheduler, is required for scheduled runs and delayed workflow steps. Manual runs do not depend on cron.
- Knowledge-base embeddings are represented in the schema, while the current retrieval path is tag/evidence based.
- LinkedIn scraping results are subject to Apify actor output and can be noisy; the workflow filters using the configured query and URL de-duplication.

## License

Private project. All rights reserved.
