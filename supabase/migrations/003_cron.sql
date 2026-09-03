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
-- REQUIRED: replace <YOUR_SCHEDULER_SECRET> with the same value as the
-- WORKFLOW_SCHEDULER_SECRET Edge Function secret before running this migration.
-- Verify after deploy: SELECT jobid, jobname, schedule, active FROM cron.job;
-- Test manually: curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/workflow-scheduler \
--   -H "Authorization: Bearer YOUR_SCHEDULER_SECRET" -H "Content-Type: application/json" -d '{}'
SELECT cron.schedule(
  'careerpilot-workflow-scheduler',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qcywswnrknzwovvaixjl.supabase.co/functions/v1/workflow-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <YOUR_SCHEDULER_SECRET>'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
