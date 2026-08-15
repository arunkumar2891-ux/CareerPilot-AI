# Deployment Guide

## Prerequisites

1. Supabase project with schema applied (run migrations in `supabase/migrations/`)
2. API keys: Apify, Gemini, Resend (optional: Google OAuth)
3. Node.js 18+

## 1. Apply Database Migrations

In Supabase SQL Editor, run in order:

1. `supabase/migrations/001_workflow_engine.sql`
2. `supabase/migrations/002_storage.sql`
3. **Enable extensions first** (see below)
4. `supabase/migrations/003_cron.sql` (edit placeholders first)

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
  APIFY_TOKEN=your_token \
  GEMINI_API_KEY=your_key \
  RESEND_API_KEY=your_key \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  WORKFLOW_SCHEDULER_SECRET=random_secret_string \
  APP_URL=https://your-app.vercel.app

supabase functions deploy workflow-run
supabase functions deploy workflow-step
supabase functions deploy workflow-scheduler
supabase functions deploy ai-chat
supabase functions deploy google-oauth-start
supabase functions deploy google-oauth-callback
```

## 3. Schedule Cron (pg_cron)

After running `003_cron.sql`, the scheduler calls `workflow-scheduler` every minute to process wait queues and due automations.

## 4. Deploy Frontend

```bash
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

npm install
npm run build
```

Deploy `dist/` to Vercel or Netlify. Set the same env vars in the hosting dashboard.

## 5. First Run

1. Sign up / log in
2. Go to **Settings → Job Search** — set query, location, Google Doc resume ID, email
3. Go to **Integrations** — add Apify token (or use server secret)
4. Go to **Workflows** — click **Import n8n Template**
5. Click **Run** or use **Jobs → Run Search**

## Architecture

- **Frontend**: React SPA on Vercel/Netlify (free)
- **Backend**: Supabase Edge Functions + PostgreSQL + Storage
- **Scheduler**: pg_cron → workflow-scheduler function
- **No n8n required**
