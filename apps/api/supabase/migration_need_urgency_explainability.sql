-- Migration: urgency explainability, confidence, and manual override tracking
ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS urgency_confidence integer;

ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS urgency_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS urgency_override_score numeric(4,2);

ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS urgency_override_note text;

ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS urgency_override_by varchar(120);

ALTER TABLE needs_report
  ADD COLUMN IF NOT EXISTS urgency_override_at timestamptz;
