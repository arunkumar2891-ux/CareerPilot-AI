-- Ensure active automations always have a schedulable next_run (UTC daily 07:00 default).
UPDATE automations
SET next_run = CASE
  WHEN (timezone('UTC', now()))::time < time '07:00'
    THEN (date_trunc('day', timezone('UTC', now())) + interval '7 hours') AT TIME ZONE 'UTC'
  ELSE (date_trunc('day', timezone('UTC', now())) + interval '1 day 7 hours') AT TIME ZONE 'UTC'
END
WHERE next_run IS NULL
  AND status = 'active';
