export interface SetupSubstep {
  text?: string;
  link?: { label: string; href: string; external?: boolean };
  code?: string;
}

export interface SetupStep {
  id: string;
  title: string;
  summary: string;
  substeps: SetupSubstep[];
  inAppLink?: { label: string; path: string };
  audience: 'user' | 'admin';
}

export const USER_SETUP_STEPS: SetupStep[] = [
  {
    id: 'account',
    title: 'Create your account',
    summary: 'Sign up or log in to CareerPilot. Your workflow and daily automation are created automatically.',
    audience: 'user',
    substeps: [
      { text: 'Use email/password, Google, GitHub, or magic link on the sign-in page.' },
      { text: 'After login, the Daily Job Search Pipeline and 7 AM automation are provisioned for you.' },
    ],
    inAppLink: { label: 'Go to Dashboard', path: '/' },
  },
  {
    id: 'profile',
    title: 'Complete your profile',
    summary: 'Add your name and job title so resumes and emails are personalized.',
    audience: 'user',
    substeps: [
      { text: 'Open Settings → Profile.' },
      { text: 'Enter your full name and current title (e.g. "Senior Product Manager").' },
      { text: 'Click Save Changes.' },
    ],
    inAppLink: { label: 'Open Settings', path: '/settings' },
  },
  {
    id: 'resume-doc',
    title: 'Prepare your Google Doc resume',
    summary: 'The pipeline reads your resume from Google Docs to tailor it for each job.',
    audience: 'user',
    substeps: [
      { text: 'Create or open your resume in Google Docs.' },
      { text: 'Share the doc with the same Gmail you will connect in Integrations (or set link sharing to "Anyone with the link").' },
      { text: 'Copy the Document ID from the URL: docs.google.com/document/d/DOCUMENT_ID/edit' },
      { text: 'Paste the ID in Settings → Job Search → Google Doc Resume ID.' },
    ],
    inAppLink: { label: 'Job Search Settings', path: '/settings' },
  },
  {
    id: 'job-search',
    title: 'Configure job search preferences',
    summary: 'Set what roles to search for, where, and how many jobs per run.',
    audience: 'user',
    substeps: [
      { text: 'Search Query — e.g. "AI Product Manager" or "Staff Software Engineer".' },
      { text: 'Location — e.g. "San Francisco, CA" or "Remote".' },
      { text: 'Max Jobs Per Run — start with 5 for testing.' },
      { text: 'Summary Email — where daily pipeline results are sent.' },
      { text: 'Click Save Job Search Settings.' },
    ],
    inAppLink: { label: 'Job Search Settings', path: '/settings' },
  },
  {
    id: 'google',
    title: 'Connect Google Drive & Docs',
    summary: 'Authorize CareerPilot to read your resume and upload tailored PDFs.',
    audience: 'user',
    substeps: [
      { text: 'Go to Integrations and click Connect Google.' },
      { text: 'Sign in with the Gmail that owns your resume doc.' },
      { text: 'If you see "Error 403: access_denied", the app admin must add your Gmail as a test user in Google Cloud OAuth (see Platform Setup below).' },
      { text: 'On the unverified-app warning, click Advanced → Go to CareerPilot (unsafe) — normal while the app is in Testing mode.' },
    ],
    inAppLink: { label: 'Open Integrations', path: '/integrations' },
  },
  {
    id: 'pipeline',
    title: 'Verify your automation',
    summary: 'Confirm the built-in daily job search workflow is active.',
    audience: 'user',
    substeps: [
      { text: 'Open Automations — you should see "Daily 7 AM Job Search" (active).' },
      { text: 'Open Workflow Studio — you should see "Daily Job Search Pipeline" with 18 nodes.' },
      { text: 'Use Run Now on Automations or Jobs → Run Search for an immediate test.' },
    ],
    inAppLink: { label: 'View Automations', path: '/automations' },
  },
  {
    id: 'first-run',
    title: 'Run your first job search',
    summary: 'Trigger the pipeline manually and watch it work end-to-end.',
    audience: 'user',
    substeps: [
      { text: 'Go to Job Discovery and click Run Search.' },
      { text: 'Open Execution History to watch each node (Apify scrape → Gemini ATS → PDF → email).' },
      { text: 'Discovered jobs appear on the Jobs board when the pipeline stores them.' },
      { text: 'First run can take several minutes while Apify scrapes LinkedIn.' },
    ],
    inAppLink: { label: 'Run Job Search', path: '/jobs' },
  },
];

export const ADMIN_SETUP_STEPS: SetupStep[] = [
  {
    id: 'supabase',
    title: 'Supabase project & database',
    summary: 'Create the backend project and apply all migrations.',
    audience: 'admin',
    substeps: [
      { text: 'Create a project at supabase.com.', link: { label: 'Supabase Dashboard', href: 'https://supabase.com/dashboard', external: true } },
      { text: 'Run migrations in SQL Editor in order: 001, 002, enable pg_cron + pg_net, 003, 004.' },
      { text: 'Enable Google provider under Authentication → Providers if using Google sign-in.' },
      { link: { label: 'Supabase SQL Editor', href: 'https://supabase.com/dashboard/project/_/sql', external: true }, text: 'Apply files from supabase/migrations/ in your repo.' },
    ],
  },
  {
    id: 'apify',
    title: 'Apify API token',
    summary: 'Powers LinkedIn job scraping in the pipeline.',
    audience: 'admin',
    substeps: [
      { text: 'Sign up at Apify.', link: { label: 'Apify Console', href: 'https://console.apify.com/', external: true } },
      { text: 'Go to Settings → Integrations → API tokens → Create new token.' },
      { text: 'Copy the token (starts with apify_api_).' },
      { text: 'Set as Supabase Edge Function secret: APIFY_TOKEN' },
      { code: 'supabase secrets set APIFY_TOKEN=apify_api_xxx --project-ref YOUR_REF' },
    ],
  },
  {
    id: 'gemini',
    title: 'Google Gemini API key',
    summary: 'Powers ATS resume optimization in the workflow.',
    audience: 'admin',
    substeps: [
      { text: 'Open Google AI Studio.', link: { label: 'Get API Key', href: 'https://aistudio.google.com/apikey', external: true } },
      { text: 'Create an API key for your Google Cloud project.' },
      { text: 'Set as Supabase secret: GEMINI_API_KEY' },
      { code: 'supabase secrets set GEMINI_API_KEY=xxx --project-ref YOUR_REF' },
    ],
  },
  {
    id: 'resend',
    title: 'Resend email API key',
    summary: 'Sends daily job search summary emails.',
    audience: 'admin',
    substeps: [
      { text: 'Sign up at Resend.', link: { label: 'Resend Dashboard', href: 'https://resend.com/api-keys', external: true } },
      { text: 'Create an API key.' },
      { text: 'Verify your sending domain (or use onboarding@resend.dev for testing).' },
      { text: 'Set secrets: RESEND_API_KEY and RESEND_FROM_EMAIL' },
      { code: 'supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="CareerPilot <onboarding@resend.dev>" --project-ref YOUR_REF' },
    ],
  },
  {
    id: 'google-oauth',
    title: 'Google Cloud OAuth (Drive/Docs)',
    summary: 'Required for Connect Google in Integrations.',
    audience: 'admin',
    substeps: [
      { text: 'Create a project in Google Cloud Console.', link: { label: 'Google Cloud Console', href: 'https://console.cloud.google.com/', external: true } },
      { text: 'Enable Google Drive API.' },
      { text: 'OAuth consent screen → External → Testing → add Test users (every Gmail that will connect).' },
      { text: 'Data access → add scopes: drive.readonly and drive.file.' },
      { text: 'Credentials → Create OAuth client (Web application).' },
      { text: 'Authorized redirect URIs — add BOTH:' },
      { code: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback\nhttps://YOUR_PROJECT_REF.supabase.co/auth/v1/callback' },
      { text: 'Set secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI' },
    ],
  },
  {
    id: 'edge-secrets',
    title: 'Remaining Supabase Edge secrets',
    summary: 'Server-side keys the workflow engine needs at runtime.',
    audience: 'admin',
    substeps: [
      { text: 'SUPABASE_SERVICE_ROLE_KEY — from Supabase Settings → API (service_role, keep secret).' },
      { text: 'APP_URL — your Render frontend URL, e.g. https://careerpilot-ai-6i93.onrender.com' },
      { text: 'WORKFLOW_SCHEDULER_SECRET — random string; must match 003_cron.sql.' },
      { text: 'LATEX_COMPILER_URL — default https://latex.ytotech.com/builds/sync' },
      { code: 'supabase secrets set APP_URL=https://careerpilot-ai-6i93.onrender.com WORKFLOW_SCHEDULER_SECRET=$(openssl rand -hex 32) --project-ref YOUR_REF' },
      { link: { label: 'Supabase Edge Secrets', href: 'https://supabase.com/dashboard/project/_/functions/secrets', external: true }, text: 'Or set via Dashboard → Edge Functions → Secrets.' },
    ],
  },
  {
    id: 'edge-functions',
    title: 'Deploy Edge Functions',
    summary: 'Deploy the workflow engine and OAuth handlers.',
    audience: 'admin',
    substeps: [
      { text: 'Install Supabase CLI and link your project.' },
      { code: 'cd CareerPilot-AI\nsupabase login\nsupabase link --project-ref YOUR_REF\nsupabase functions deploy --project-ref YOUR_REF' },
      { text: 'Functions: workflow-run, workflow-step, workflow-scheduler, ai-chat, google-oauth-start, google-oauth-callback' },
    ],
  },
  {
    id: 'cron',
    title: 'Schedule automations (pg_cron)',
    summary: 'Runs daily job search and resumes Apify wait steps.',
    audience: 'admin',
    substeps: [
      { text: 'Enable pg_cron and pg_net in Supabase Dashboard → Database → Extensions.' },
      { text: 'Edit supabase/migrations/003_cron.sql — set project ref and WORKFLOW_SCHEDULER_SECRET.' },
      { text: 'Run 003_cron.sql in SQL Editor.' },
      { text: 'Alternative: use cron-job.org to POST to workflow-scheduler every minute.' },
    ],
  },
  {
    id: 'render',
    title: 'Deploy frontend on Render',
    summary: 'Host the React app users interact with.',
    audience: 'admin',
    substeps: [
      { text: 'Render → New → Static Site → connect GitHub repo.', link: { label: 'Render Dashboard', href: 'https://dashboard.render.com/', external: true } },
      { text: 'Build: npm install && npm run build — Publish: dist' },
      { text: 'Environment variables (only these two on Render):' },
      { code: 'VITE_SUPABASE_URL=https://YOUR_REF.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key' },
      { text: 'Add rewrite: /* → /index.html (or use render.yaml in repo).' },
      { text: 'Update Supabase Auth → URL Configuration with your Render URL.' },
      { text: 'Update APP_URL secret to match your Render URL.' },
    ],
  },
];
