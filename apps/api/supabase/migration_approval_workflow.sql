-- Migration: Add reporter approval workflow columns to needs_report
-- Run this in Supabase → SQL Editor

-- 1. Add reporter_clerk_id to link each submission to the reporter who submitted it
ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS reporter_clerk_id varchar(200);

-- 2. Add rejection_note so coordinators can explain why a need was rejected
ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS rejection_note text;

-- 3. Change default status to 'pending' for new submissions
ALTER TABLE needs_report
  ALTER COLUMN status SET DEFAULT 'pending';

-- 4. Index for fast reporter-specific queries (/needs?reporter_clerk_id=...)
CREATE INDEX IF NOT EXISTS idx_needs_reporter
  ON needs_report (reporter_clerk_id, created_at DESC);

-- 5. Index for fast status filtering (/needs?status=pending)
CREATE INDEX IF NOT EXISTS idx_needs_status
  ON needs_report (status, created_at DESC);

-- OPTIONAL: If you have existing test data with status='open' that you want to keep visible
-- to coordinators, leave them as-is. Only NEW submissions will default to 'pending'.
