-- Migration: Multi-volunteer task assignments and per-volunteer completion tracking

CREATE TABLE IF NOT EXISTS task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'assigned', -- assigned|completed
  completion_note text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_task_created
  ON task_assignments (task_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_task_assignments_volunteer_created
  ON task_assignments (volunteer_id, created_at DESC);
