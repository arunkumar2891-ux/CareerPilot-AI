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
  optional?: boolean;
  time?: string;
}

export const USER_SETUP_STEPS: SetupStep[] = [
  {
    id: 'account',
    title: 'Sign in',
    summary: 'Create an account or log in. CareerPilot then provisions your pipeline, automation, and Master ATS corpus automatically — no import needed.',
    audience: 'user',
    time: '1 min',
    substeps: [
      { text: 'Go to /auth and sign up with email/password, Google, GitHub, or a magic link.' },
      { text: 'Wait until the dashboard loads. In the background we create: Daily Job Search Pipeline, Daily 7 AM automation, Master ATS (bullet bank), 2-page template, and career evidence chunks.' },
      { text: 'If resumes are empty, refresh once — seeding runs on first authenticated page load.' },
    ],
    inAppLink: { label: 'Go to Dashboard', path: '/' },
  },
  {
    id: 'profile',
    title: 'Name, title, and contact for resumes',
    summary: 'These values are written into the Master ATS and 2-page template headers. Do this before generating a PDF.',
    audience: 'user',
    time: '2 min',
    substeps: [
      { text: 'Settings → Profile → Full Name and Title (e.g. Integration Architect).' },
      { text: 'On the same page fill Phone, Location, LinkedIn URL, GitHub URL, and PANW start date.' },
      { text: 'Click Save Profile (writes name/title plus contact) or Save Contact for Resumes. Then open Resume Studio — Master ATS should show real phone/LinkedIn/GitHub, not [Phone Number].' },
      { text: 'Skip any field you do not want on the resume; blank fields stay as placeholders.' },
    ],
    inAppLink: { label: 'Open Profile & Contact', path: '/settings' },
  },
  {
    id: 'resume-doc',
    title: 'Confirm the Master ATS corpus',
    summary: 'Tailoring selects from your 70+ real bullets. You should see two seeded resumes — do not paste a Google Doc as the source of truth.',
    audience: 'user',
    time: '1 min',
    substeps: [
      { text: 'Open Resume Studio. You should see "Master ATS (bullet bank)" and "2-page template".' },
      { text: 'Open Master ATS and skim — FW_Flex, PC to CC, Portal, incident, security, leadership should all be there.' },
      { text: 'Optional: Knowledge Base → search "66%" or "BigQuery" to confirm evidence chunks seeded.' },
      { text: 'Do not replace the Master ATS content with a short 2-page resume. The optimizer picks 4–6 bullets per project from the full bank.' },
    ],
    inAppLink: { label: 'Open Resume Studio', path: '/resumes' },
  },
  {
    id: 'job-search',
    title: 'Set what to search for',
    summary: 'Used by Jobs → Run Search and the daily 7 AM automation.',
    audience: 'user',
    time: '1 min',
    substeps: [
      { text: 'Settings → Job Search.' },
      { text: 'Search Query — match how you want LinkedIn scraped, e.g. "Integration Architect" or "Forward Deployment Engineer".' },
      { text: 'Location — e.g. "San Francisco, CA" or "Remote".' },
      { text: 'Max Jobs Per Run — start with 3–5 while you test tailoring.' },
      { text: 'Settings → Notifications → Summary Email (where daily results go).' },
      { text: 'Click Save Job Search Settings (and Save on Notifications).' },
    ],
    inAppLink: { label: 'Job Search Settings', path: '/settings' },
  },
  {
    id: 'google',
    title: 'Connect Google (optional)',
    summary: 'Only needed if you want tailored PDFs uploaded to Drive. Resume tailoring itself uses the in-app corpus.',
    audience: 'user',
    optional: true,
    time: '3 min',
    substeps: [
      { text: 'Integrations → Connect Google. Use the Gmail you want Drive files owned by.' },
      { text: 'If you see 403 access_denied, an admin must add your Gmail as an OAuth test user (Platform Setup → Google Cloud OAuth).' },
      { text: 'Unverified-app warning: Advanced → Go to CareerPilot (unsafe). Normal while the OAuth app is in Testing.' },
      { text: 'Google Doc Resume ID in Job Search settings is optional — header/contact override only, not the bullet bank.' },
    ],
    inAppLink: { label: 'Open Integrations', path: '/integrations' },
  },
  {
    id: 'pipeline',
    title: 'Check the daily automation',
    summary: 'Confirm the built-in workflow exists so a schedule or Run Search can fire.',
    audience: 'user',
    time: '1 min',
    substeps: [
      { text: 'Automations — "Daily 7 AM Job Search" should be Active.' },
      { text: 'Workflow Studio — "Daily Job Search Pipeline" should exist. ATS Optimizer uses the corpus even if Google Docs is skipped.' },
      { text: 'Use Automations → Run Now when you want an immediate pipeline run (needs Apify + Gemini secrets on the server).' },
    ],
    inAppLink: { label: 'View Automations', path: '/automations' },
  },
  {
    id: 'first-run',
    title: 'Tailor one resume, then run search',
    summary: 'Prove bullet selection on a real JD first; then turn on discovery.',
    audience: 'user',
    time: '5–15 min',
    substeps: [
      { text: 'Fast path (no scrape): if a job is already on the Jobs board, open it → Generate tailored resume. A new resume named "Tailored: Company Role" appears in Resume Studio.' },
      { text: 'Full path: Jobs → Run Search. Execution History shows Apify scrape → ATS optimizer → PDF. First scrape can take several minutes.' },
      { text: 'Sanity-check the tailored text: lead project should match the JD type (e.g. FW_Flex for Integration Architect, Portal for FDE). Numbers like 66% / 278 to 94 must still appear — never invented.' },
      { text: 'If tailoring fails with "Career corpus not seeded", refresh the app once while signed in, then retry.' },
    ],
    inAppLink: { label: 'Open Jobs', path: '/jobs' },
  },
];

export const ADMIN_SETUP_STEPS: SetupStep[] = [
  {
    id: 'supabase',
    title: 'Supabase project & database',
    summary: 'Create the backend project and apply all migrations, including knowledge_chunks.',
    audience: 'admin',
    substeps: [
      { text: 'Create a project at supabase.com.', link: { label: 'Supabase Dashboard', href: 'https://supabase.com/dashboard', external: true } },
      { text: 'Run migrations in SQL Editor in order: 001, 002, enable pg_cron + pg_net, 003, 004, 005 (knowledge_chunks).' },
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
    summary: 'Powers ATS resume optimization (selects from the Master ATS corpus).',
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
    summary: 'Only if users will Connect Google to upload PDFs. Not required for in-app tailoring.',
    audience: 'admin',
    optional: true,
    substeps: [
      { text: 'Create a project in Google Cloud Console.', link: { label: 'Google Cloud Console', href: 'https://console.cloud.google.com/', external: true } },
      { text: 'Enable Google Drive API.' },
      { text: 'OAuth consent screen → External → Testing → add Test users (every Gmail that will connect).' },
      { text: 'Data access → add scopes: drive.readonly and drive.file.' },
      { text: 'Credentials → Create OAuth client (Web application).' },
      { text: 'Authorized redirect URIs — add BOTH:' },
      { code: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/google-oauth-callback\nhttps://YOUR_PROJECT_REF.supabase.co/auth/v1/callback' },
      { text: 'Set secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI' },
      { text: 'Deploy OAuth functions with JWT verification off (Google’s redirect has no auth header). Use --no-verify-jwt, then Connect Google from the signed-in app — do not open the function URL in a new tab.' },
      { code: 'supabase functions deploy google-oauth-start --no-verify-jwt --project-ref YOUR_REF\nsupabase functions deploy google-oauth-callback --no-verify-jwt --project-ref YOUR_REF' },
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
    summary: 'Deploy the workflow engine, ATS chat, and OAuth handlers. Re-deploy after corpus changes.',
    audience: 'admin',
    substeps: [
      { text: 'Install Supabase CLI and link your project.' },
      { code: 'cd CareerPilot-AI\nsupabase login\nsupabase link --project-ref YOUR_REF\nsupabase functions deploy --project-ref YOUR_REF' },
      { text: 'Required for tailoring: ai-chat, workflow-run, workflow-step. Also: workflow-scheduler, google-oauth-start, google-oauth-callback.' },
    ],
  },
  {
    id: 'cron',
    title: 'Schedule automations (pg_cron)',
    summary: 'Runs daily job search and resumes Apify wait steps.',
    audience: 'admin',
    optional: true,
    substeps: [
      { text: 'Enable pg_cron and pg_net in Supabase Dashboard → Database → Extensions.' },
      { text: 'Edit supabase/migrations/003_cron.sql — set project ref and WORKFLOW_SCHEDULER_SECRET.' },
      { text: 'Run 003_cron.sql in SQL Editor.' },
      { text: 'Alternative: use cron-job.org to POST to workflow-scheduler every minute. Manual Run Search still works without cron.' },
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
