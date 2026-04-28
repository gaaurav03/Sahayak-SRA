-- Migration: Task approval workflow for reporter-created tasks

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'pending';

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS rejection_note text;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reporter_clerk_id varchar(200);

CREATE INDEX IF NOT EXISTS idx_tasks_approval_status_created
  ON tasks (approval_status, created_at DESC);

ALTER TABLE tasks
  ALTER COLUMN approval_status SET DEFAULT 'approved';

UPDATE tasks
SET approval_status = 'approved'
WHERE approval_status = 'pending';
