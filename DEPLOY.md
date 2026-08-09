# Deployment Guide

## Prerequisites

1. Supabase project with schema applied (run migrations in `supabase/migrations/`)
2. API keys: Apify, Gemini, Resend (optional: Google OAuth)
3. Node.js 18+

## 1. Apply Database Migrations

In Supabase SQL Editor, run in order:

- `supabase/migrations/001_workflow_engine.sql`
- `supabase/migrations/002_storage.sql`
- `supabase/migrations/003_cron.sql`

Enable extensions: **pg_cron**, **pg_net** (Dashboard → Database → Extensions).

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
