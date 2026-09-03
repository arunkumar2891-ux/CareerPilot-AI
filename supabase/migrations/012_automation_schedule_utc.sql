-- Backfill automation next_run at 07:00 UTC for daily schedules missing a next_run.
UPDATE automations
SET next_run = CASE
  WHEN (timezone('UTC', now()))::time < time '07:00'
    THEN (date_trunc('day', timezone('UTC', now())) + interval '7 hours') AT TIME ZONE 'UTC'
  ELSE (date_trunc('day', timezone('UTC', now())) + interval '1 day 7 hours') AT TIME ZONE 'UTC'
END
WHERE next_run IS NULL
  AND status = 'active'
  AND schedule = '0 7 * * *';
