-- Migration 023: Add interview_prep JSONB column to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS interview_prep jsonb;
