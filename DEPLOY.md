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
  GEMINI_API_KEY=your_gemini_key \
  RESEND_API_KEY=your_resend_key \
  RESEND_FROM_EMAIL="CareerPilot <onboarding@resend.dev>" \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  WORKFLOW_SCHEDULER_SECRET=your_random_secret_string \
  GOOGLE_CLIENT_ID=your_google_client_id \
  GOOGLE_CLIENT_SECRET=your_google_client_secret \
  GOOGLE_REDIRECT_URI=https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback \
  APP_URL=https://your-app.vercel.app \
  LATEX_COMPILER_URL=https://latex.ytotech.com/builds/sync

supabase functions deploy workflow-run
supabase functions deploy workflow-step
supabase functions deploy workflow-scheduler
supabase functions deploy ai-chat
supabase functions deploy google-oauth-start --no-verify-jwt
supabase functions deploy google-oauth-callback --no-verify-jwt
```

Or deploy all at once:

```bash
supabase functions deploy --project-ref YOUR_PROJECT_REF
```

> Run `supabase functions deploy` in your **terminal**, not the Supabase SQL Editor.

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
4. **Redirects/Rewrites** → add rewrite: `/*` → `/index.html` (or rely on `public/_redirects` copied into `dist`)
5. **Create Static Site**

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

`render.yaml` and `public/_redirects` handle SPA routing (`/*` → `index.html`).

## 5. First run

After signing up or logging in, the app **automatically provisions**:

- **Daily Job Search Pipeline** workflow (18 nodes)
- **Daily 7 AM Job Search** automation (active)
- Default job search settings (if none exist)

No import or manual setup is required. Then:

1. **Settings → Job Search** — set search query, location, Google Doc resume ID, notification email
2. **Integrations** — connect Google; verify Apify (uses `APIFY_TOKEN` secret if not stored per-user)
3. **Jobs → Run Search** — run the pipeline immediately
4. **Executions** — watch per-node progress
5. **Automations** — confirm daily schedule; use **Run Now** anytime

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
| No jobs after run | Check Executions for node errors; verify Apify actor + token |
| Integrations migration error | Run updated `004` (drops function before view) |
