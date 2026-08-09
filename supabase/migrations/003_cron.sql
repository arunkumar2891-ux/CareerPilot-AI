-- pg_cron scheduler: calls workflow-scheduler every minute
-- Requires pg_cron and pg_net extensions enabled

-- Store project URL and scheduler secret in vault or replace placeholders below
-- Run this AFTER deploying workflow-scheduler Edge Function

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('careerpilot-workflow-scheduler');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Replace YOUR_PROJECT_REF and YOUR_SCHEDULER_SECRET before running
SELECT cron.schedule(
  'careerpilot-workflow-scheduler',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/workflow-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SCHEDULER_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
