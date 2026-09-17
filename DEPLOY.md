# Deployment Guide

End-to-end setup for CareerPilot AI: database, Edge Functions, scheduler, and frontend.

## Prerequisites

1. Supabase project
2. API keys: Apify, Gemini, Resend (optional: Google OAuth)
3. Node.js 18+

## 1. Apply database migrations

In the Supabase SQL Editor, run **in order**:

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/001_workflow_engine.sql` | Workflow engine tables, settings RPCs, integrations |
| 2 | `supabase/migrations/002_storage.sql` | `resumes` storage bucket + RLS |
| 3 | Enable extensions (see below) | Required before cron migration |
| 4 | `supabase/migrations/003_cron.sql` | pg_cron scheduler (edit placeholders first) |
| 5 | `supabase/migrations/004_fix_integrations_security.sql` | SECURITY INVOKER integrations RPC |
| 6 | `supabase/migrations/005_knowledge_chunks.sql` | Career evidence chunks for resume tailoring |
| 7 | `supabase/migrations/006_*.sql` … `027_*.sql` | Remaining feature migrations, in filename order |

Everything through **`027_workflow_edges_unique.sql`** must be applied. Two matter most for
the job-search pipeline:

| File | Why it matters |
|------|----------------|
| `026_run_batches.sql` | `workflow_run_batches` + batch columns on `workflow_runs`. The partial unique index on `(batch_id, batch_index)` is what stops a search target being spawned twice. |
| `027_workflow_edges_unique.sql` | Dedupes `workflow_edges` and enforces uniqueness, so a duplicate edge cannot make the executor fork down the same branch twice. |

### Enable pg_cron and pg_net (required before 003)

**Option A — Dashboard (recommended):**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **Database** → **Extensions**
3. Search and enable **`pg_cron`**
4. Search and enable **`pg_net`**
5. Wait a few seconds, then run `003_cron.sql`

**Option B — SQL:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

If you get `schema "cron" does not exist`, the extension is not enabled yet — use Option A.

### Edit 003 before running

In `003_cron.sql`, replace:

- `YOUR_PROJECT_REF` → your project ref (from the Supabase URL, e.g. `abcdefghijklmnop`)
- `YOUR_SCHEDULER_SECRET` → same value you set in `WORKFLOW_SCHEDULER_SECRET` Edge Function secret

### Migration 004 note

If you previously ran an older version of `004` and see:

```
cannot drop view integrations_safe because other objects depend on it
```

The current migration drops `get_integrations_safe()` **before** the view. Re-run the updated `004_fix_integrations_security.sql`.

### Alternative if pg_cron is unavailable

Use a free external cron (e.g. [cron-job.org](https://cron-job.org)) to POST every minute:

```
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/workflow-scheduler
Authorization: Bearer YOUR_SCHEDULER_SECRET
Content-Type: application/json
Body: {}
```

Manual workflow runs still work without cron — only scheduled automations and Apify wait/resume need the scheduler.

## 2. Deploy Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase secrets set \
  APIFY_TOKEN=your_apify_token \
  GEMINI_API_KEY=your_primary_gemini_key \
  GEMINI_API_KEY_FALLBACK=your_second_account_gemini_key \
  GEMINI_MODEL=gemini-3.6-flash \
  GROQ_API_KEY=your_groq_key \
  GROQ_MODEL=openai/gpt-oss-120b \
  AI_TIMEOUT_MS=30000 \
  AI_ATS_TIMEOUT_MS=75000 \
  AI_MAX_RETRIES=1 \
  RESEND_API_KEY=your_resend_key \
  RESEND_FROM_EMAIL="CareerPilot <onboarding@resend.dev>" \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  WORKFLOW_SCHEDULER_SECRET=your_random_secret_string \
  DEPLOY_SYNC_SECRET=your_random_secret_string \
  GOOGLE_CLIENT_ID=your_google_client_id \
  GOOGLE_CLIENT_SECRET=your_google_client_secret \
  GOOGLE_REDIRECT_URI=https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback \
  APP_URL=https://your-app.vercel.app \
  LATEX_COMPILER_URL=https://latex.ytotech.com/builds/sync

supabase functions deploy workflow-run
supabase functions deploy workflow-step
supabase functions deploy workflow-scheduler
supabase functions deploy ai-chat
supabase functions deploy careerpilot-doc-sync --no-verify-jwt
supabase functions deploy google-oauth-start --no-verify-jwt
supabase functions deploy google-oauth-callback --no-verify-jwt
```

Or deploy all at once:

```bash
supabase functions deploy --project-ref YOUR_PROJECT_REF
```

> Run `supabase functions deploy` in your **terminal**, not the Supabase SQL Editor.

Function settings such as `verify_jwt` are read from `supabase/config.toml` during deploy — you do not need `--no-verify-jwt` flags when that file is present.

### Which functions to redeploy after a backend change

Everything under `supabase/functions/_shared/` is bundled into each function that imports it, so editing a shared file changes nothing in production until the **importing** functions are redeployed. Common cases:

| Changed | Redeploy |
|---------|----------|
| `_shared/career-corpus/prompt.ts`, `_shared/ai/validate-resume.ts`, `_shared/ai/router.ts` (resume contract, generation, validation) | `workflow-run`, `workflow-step`, `ai-chat` |
| `_shared/resume-latex.ts`, `resume-pdf.ts`, `resume-drive.ts` (PDF build, Drive sync) | `resume-actions`, plus `workflow-step` for pipeline-generated PDFs |
| `_shared/workflow/**` (executor, nodes, pipeline) | `workflow-run`, `workflow-step`, `workflow-scheduler` |

When in doubt, `supabase functions deploy --project-ref YOUR_PROJECT_REF` deploys all of them. A stale deploy is a common source of "I changed the code and nothing happened."

### Automated deploy (GitHub Actions)

Merges to `main` that touch `supabase/functions/**` or `supabase/config.toml` trigger `.github/workflows/deploy-supabase-functions.yml`, which deploys all Edge Functions to your linked Supabase project.

**One-time setup** — add these repository secrets in GitHub → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Value |
|--------|--------|
| `SUPABASE_ACCESS_TOKEN` | [Supabase access token](https://supabase.com/dashboard/account/tokens) with **Edge Functions (read-write)** scope |
| `SUPABASE_PROJECT_REF` | Project ref (`qcywswnrknzwovvaixjl`) **or** full URL (`https://<ref>.supabase.co`) — used for deploy and post-deploy Google Doc sync |
| `DEPLOY_SYNC_SECRET` | Random secret; set the same value as Supabase secret `DEPLOY_SYNC_SECRET` (see below) |

After saving secrets, either merge a backend change to `main` or run the workflow manually from **Actions** → **Deploy Supabase Edge Functions** → **Run workflow**.

Frontend deploys (Vercel/Render) are unchanged — this workflow only updates Supabase Edge Functions.

### Google OAuth (Supabase Auth + Drive/Docs)

1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google provider in Supabase Dashboard → Authentication → Providers
3. Set redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. Set Edge Function redirect: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback`

## 3. Scheduler (pg_cron)

After running `003_cron.sql`, the scheduler calls `workflow-scheduler` every minute to:

- Process due automations (e.g. daily 7 AM job search)
- Resume workflows waiting on Apify polls or wait nodes

## 4. Deploy frontend (Render)

CareerPilot is a static Vite SPA. Use a **Render Static Site** (not a Web Service).

### Option A — Blueprint (recommended)

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect the `CareerPilot-AI` repository
4. Render reads `render.yaml` automatically
5. When prompted, set environment variables:
   - `VITE_SUPABASE_URL` = `https://qcywswnrknzwovvaixjl.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your anon key (Supabase → Settings → API)
6. Click **Apply** — Render builds and deploys

Your URL will be `https://careerpilot-ai.onrender.com` (or similar).

### Option B — Manual static site

1. **New** → **Static Site** → connect GitHub repo
2. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. **Environment** → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. **Redirects/Rewrites** → add a **Rewrite** (not a Redirect): Source `/*`, Destination `/index.html`. Render ignores Netlify-style `public/_redirects` unless this is set (or you used the Blueprint `render.yaml` routes). The build also copies `dist/404.html` from `index.html` as a fallback.
5. **Create Static Site**

### The version label

The sidebar shows `beta v1.3 · 0914.0815` — the `package.json` version, then a **build stamp** (`MMDD.HHmm`, UTC) that changes automatically on every build. Hover it to see the exact build time.

The build stamp is what tells you a deploy actually landed, and it needs no action from you. The `v1.3` part only changes when you bump it:

```bash
npm run version:bump
git commit -am "Bump version"
git push
```

`1.0 → 1.1 → 1.2 … 1.999 → 2.0`. The script keeps `package-lock.json` in sync so `npm ci` on the build host still works.

> **Why the version number can't auto-increment on Render:** builds run on a depth-1 **shallow clone** (so `git rev-list --count HEAD` always returns `1`, and `git fetch --unshallow` is blocked), and the build container cannot commit a bumped `package.json` back to the repo. Adding `npm run version:bump` to the build command does **not** work — every build re-reads the same committed value, so the number would advance one step and then freeze. That is why the build timestamp carries the per-deploy signal instead. To get true sequential numbering, bump from CI (a GitHub Action that commits) rather than from the build command.

### After Render deploy

Update Supabase and secrets with your live URL (e.g. `https://careerpilot-ai.onrender.com`):

```bash
supabase secrets set APP_URL=https://careerpilot-ai.onrender.com --project-ref qcywswnrknzwovvaixjl
```

**Supabase Dashboard → Authentication → URL Configuration:**

- **Site URL:** `https://careerpilot-ai.onrender.com`
- **Redirect URLs:** `https://careerpilot-ai.onrender.com/**` and `http://localhost:5173/**`

### Local build (optional)

```bash
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY only

npm install
npm run build
```

`render.yaml` rewrites `/*` → `index.html`. If the site was created manually, add that rewrite in the Render dashboard or the next build’s `404.html` fallback will serve the SPA for deep links like `/integrations`.

### Static assets and the webfont

`index.html` references brand assets served from `public/` (copied verbatim into `dist/` by
Vite, no build step): `favicon.svg`, `apple-touch-icon.svg`, `og-image.svg`. It also sets
light/dark `theme-color` and the OG/Twitter card tags.

Two things to know:

- **Fonts load from Google Fonts at runtime** (`Inter Tight` + `JetBrains Mono`, with
  `preconnect` and `display=swap`). This is the app's only third-party runtime dependency for
  the frontend. On a network that blocks `fonts.googleapis.com` the app still renders — it
  falls back through `ui-sans-serif`/`system-ui` — but metrics shift, so a layout that was
  only ever checked with the webfont present may look different. Self-host the two families
  under `public/` if that matters for your deployment.
- **`og-image.svg` is an SVG.** LinkedIn and Twitter/X do **not** render SVG OG images. If
  link previews matter, export a 1200×630 PNG and point `og:image` at it.

## 5. First run

After signing up or logging in, the app **automatically provisions**:

- **Daily Job Search Pipeline** workflow (18 nodes)
- **Daily 7 AM Job Search** automation (active)
- Default job search settings (if none exist)

No import or manual setup is required. Then:

1. **Corpus** — add a master resume via Google Doc, PDF/DOCX/MD upload, or paste. Role-specific resumes are optional.
2. **Settings → Job Search** — set search query, location, optional Google Doc resume ID, notification email
3. **Integrations** — connect Google; verify Apify (uses `APIFY_TOKEN` secret if not stored per-user)
4. **Jobs → Run Search** — run the pipeline immediately
5. **Executions** — watch per-node progress
6. **Automations** — confirm daily schedule; use **Run Now** anytime

### Optional: customize the pipeline

Open **Workflow Studio** to inspect or edit the built-in graph. The source definition is in `src/constants/workflow-seed.ts`.

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────┐
│  React SPA  │────▶│  Supabase (Auth, DB, Storage, RLS)   │
│  Render     │     └──────────────────────────────────────┘
│  (static)   │                        ▲
└──────┬──────┘                        │
       │ invoke                        │ service role
       ▼                               │
┌──────────────────────────────────────┴───────┐
│  Edge Functions (Deno)                       │
│  workflow-run → workflow-step (resumable)  │
│  workflow-scheduler ← pg_cron (every minute) │
│  ai-chat, google-oauth-*                     │
└────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  External APIs                               │
│  Apify · Gemini · Resend · Google · LaTeX    │
└──────────────────────────────────────────────┘
```

- **Frontend**: React SPA on Render Static Site
- **Backend**: Supabase Edge Functions + PostgreSQL + Storage
- **Scheduler**: pg_cron → `workflow-scheduler`
- **Bootstrap**: `BootstrapService` provisions workflow + automation on login
- **No n8n or external workflow tool required**

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `schema "cron" does not exist` | Enable `pg_cron` extension in Dashboard |
| Workflow run fails immediately | Check Edge Function logs; verify secrets are set |
| Google Docs node fails | Connect Google in Integrations; set resume Doc ID in Settings |
| Apify hangs | Ensure `workflow-scheduler` is running (cron or external) |
| Typography looks different from local | `fonts.googleapis.com` is blocked or slow; the app falls back to system sans. Self-host Inter Tight / JetBrains Mono under `public/` if needed |
| Link previews show no image | `og:image` is an SVG, which LinkedIn and Twitter/X ignore. Export a 1200×630 PNG |
| A page shows "Something went wrong" | An `ErrorBoundary` caught a render throw. The message is on screen and the component stack is in the browser console. Navigating to another route clears it |
| No jobs after run | Check Executions for node errors; verify Apify actor + token |
| Integrations migration error | Run updated `004` (drops function before view) |
