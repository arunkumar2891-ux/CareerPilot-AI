-- Collapse duplicate jobs (same LinkedIn URL first, then same posting text)
-- then enforce uniqueness so the pipeline cannot insert them again.

-- jobs historically had a BEFORE UPDATE trigger that writes NEW.updated_at
-- even though the table had no such column. Add the column first, then make
-- the shared trigger skip tables that still lack it.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS content_fingerprint text;

-- Canonicalize LinkedIn view URLs so tracking params / slugs are not "different" jobs.
UPDATE jobs
SET url = 'https://www.linkedin.com/jobs/view/' || (regexp_match(url, '/jobs/view/(?:[^/]*-)?(\d+)'))[1]
WHERE url ILIKE '%linkedin.com/jobs/view/%'
  AND regexp_match(url, '/jobs/view/(?:[^/]*-)?(\d+)') IS NOT NULL;

UPDATE jobs
SET content_fingerprint = lower(btrim(coalesce(company, '')))
  || '|' || lower(btrim(coalesce(role, '')))
  || '|' || lower(btrim(coalesce(location, '')))
  || '|' || left(regexp_replace(lower(coalesce(description, '')), '\s+', ' ', 'g'), 400)
WHERE content_fingerprint IS NULL OR content_fingerprint = '';

-- Point tailored resumes at the oldest row in each URL group, then drop extras.
WITH ranked AS (
  SELECT
    id,
    user_id,
    url,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, url
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM jobs
  WHERE url IS NOT NULL AND btrim(url) <> ''
),
dupes AS (
  SELECT d.id AS dupe_id, k.id AS keep_id
  FROM ranked d
  JOIN ranked k
    ON k.user_id = d.user_id
   AND k.url = d.url
   AND k.rn = 1
  WHERE d.rn > 1
)
UPDATE resumes r
SET job_id = dupes.keep_id
FROM dupes
WHERE r.job_id = dupes.dupe_id;

WITH ranked AS (
  SELECT
    id,
    user_id,
    url,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, url
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM jobs
  WHERE url IS NOT NULL AND btrim(url) <> ''
)
DELETE FROM jobs
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Same posting under different LinkedIn IDs.
WITH ranked AS (
  SELECT
    id,
    user_id,
    content_fingerprint,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, content_fingerprint
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM jobs
  WHERE content_fingerprint IS NOT NULL AND content_fingerprint <> ''
),
dupes AS (
  SELECT d.id AS dupe_id, k.id AS keep_id
  FROM ranked d
  JOIN ranked k
    ON k.user_id = d.user_id
   AND k.content_fingerprint = d.content_fingerprint
   AND k.rn = 1
  WHERE d.rn > 1
)
UPDATE resumes r
SET job_id = dupes.keep_id
FROM dupes
WHERE r.job_id = dupes.dupe_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, content_fingerprint
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM jobs
  WHERE content_fingerprint IS NOT NULL AND content_fingerprint <> ''
)
DELETE FROM jobs
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_url_uidx
  ON jobs (user_id, url)
  WHERE url IS NOT NULL AND btrim(url) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_fingerprint_uidx
  ON jobs (user_id, content_fingerprint)
  WHERE content_fingerprint IS NOT NULL AND content_fingerprint <> '';
