-- Migration: Need approval timestamps for explainable timeline

ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
