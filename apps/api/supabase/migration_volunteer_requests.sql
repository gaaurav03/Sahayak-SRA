-- Migration: Volunteer participation request workflow

CREATE TABLE IF NOT EXISTS volunteer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  need_id uuid REFERENCES needs_report(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  note text DEFAULT '',
  coordinator_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_requests_target_check CHECK (need_id IS NOT NULL OR task_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_requests_status_created
  ON volunteer_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_volunteer_requests_volunteer_created
  ON volunteer_requests (volunteer_id, created_at DESC);
