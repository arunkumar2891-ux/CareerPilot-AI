-- One scheduled fire per user + workflow name per UTC day.
-- Duplicate "Daily Job Search Pipeline" copies and overlapping pg_net ticks
-- previously each claimed their own automations.last_run and started a run.

CREATE TABLE IF NOT EXISTS scheduled_run_slots (
  user_id uuid NOT NULL,
  schedule_key text NOT NULL,
  utc_date date NOT NULL,
  workflow_id uuid,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, schedule_key, utc_date)
);

CREATE INDEX IF NOT EXISTS scheduled_run_slots_workflow_day
  ON scheduled_run_slots (workflow_id, utc_date);

ALTER TABLE scheduled_run_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scheduled_run_slots FROM anon, authenticated;
GRANT ALL ON TABLE scheduled_run_slots TO service_role;

-- Keep the oldest active automation per workflow, then per user+workflow name.
WITH ranked_workflow AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY workflow_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM automations
  WHERE status = 'active'
)
UPDATE automations
SET status = 'paused'
WHERE id IN (SELECT id FROM ranked_workflow WHERE rn > 1);

WITH ranked_name AS (
  SELECT
    a.id,
    row_number() OVER (
      PARTITION BY a.user_id, lower(btrim(coalesce(w.name, a.name, '')))
      ORDER BY a.created_at ASC NULLS LAST, a.id ASC
    ) AS rn
  FROM automations a
  LEFT JOIN workflows w ON w.id = a.workflow_id
  WHERE a.status = 'active'
)
UPDATE automations
SET status = 'paused'
WHERE id IN (SELECT id FROM ranked_name WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS automations_one_active_per_workflow
  ON automations (workflow_id)
  WHERE status = 'active';
