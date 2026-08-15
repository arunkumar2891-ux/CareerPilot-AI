-- pg_cron scheduler: calls workflow-scheduler every minute
--
-- PREREQUISITE (do this FIRST if the SQL below fails):
--   Supabase Dashboard → Database → Extensions
--   Enable: "pg_cron" and "pg_net"
--   Then re-run this file.
--
-- Also replace YOUR_PROJECT_REF and YOUR_SCHEDULER_SECRET below.

-- Enable extensions (works on most Supabase projects; if this fails, use the Dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove existing job if re-running
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid := (
      SELECT jobid FROM cron.job WHERE jobname = 'careerpilot-workflow-scheduler' LIMIT 1
    ));
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: every minute, POST to workflow-scheduler Edge Function
-- Replace YOUR_PROJECT_REF and YOUR_SCHEDULER_SECRET before running
SELECT cron.schedule(
  'careerpilot-workflow-scheduler',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qcywswnrknzwovvaixjl.supabase.co/functions/v1/workflow-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer a3f8c2e91b4d7f6e8a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
