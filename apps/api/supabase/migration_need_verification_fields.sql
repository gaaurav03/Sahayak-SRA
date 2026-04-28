-- Migration: Add reporter trust-verification fields for needs
ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS client_captured_at timestamptz;
