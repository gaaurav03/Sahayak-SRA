-- Sahayak MVP schema (single-org demo -> multi-org)
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  slug varchar(100) unique not null,
  type varchar(50) default 'ngo',
  district varchar(100),
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_id varchar(200) unique not null,
  org_id uuid references organizations(id),
  full_name varchar(200) not null,
  email varchar(200),
  phone varchar(30),
  role varchar(20) not null, -- 'coordinator', 'volunteer', 'reporter'
  created_at timestamptz not null default now()
);

create table if not exists needs_report (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  submitted_by uuid references users(id),
  reporter_clerk_id varchar(200),          -- Clerk userId of the reporter (populated on submit)
  title varchar(300) not null,
  description text default '',
  category varchar(50) not null,
  severity_self varchar(20) not null,
  affected_count integer default 0,
  location_text varchar(240) not null,
  lat double precision,
  lng double precision,
  urgency_score numeric(4,2) not null,
  status varchar(30) not null default 'pending',  -- pending|open|rejected|task_created|resolved
  rejection_note text,
  approved_at timestamptz,
  rejected_at timestamptz,
  image_urls text[] default '{}',
  client_captured_at timestamptz,
  urgency_confidence integer,
  urgency_reasons jsonb not null default '[]'::jsonb,
  urgency_override_score numeric(4,2),
  urgency_override_note text,
  urgency_override_by varchar(120),
  urgency_override_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  clerk_id varchar(200) unique,
  full_name varchar(200) not null,
  phone varchar(30) not null,
  email varchar(200) unique,
  skills text[] not null default '{}',
  location_text varchar(240) not null,
  lat double precision,
  lng double precision,
  availability jsonb not null default '{}'::jsonb,
  max_tasks integer not null default 2,
  active_tasks integer not null default 0,
  approval_status varchar(20) not null default 'approved', -- pending|approved|rejected
  rejection_note text,
  is_active boolean not null default false,
  total_deployments integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  created_by uuid references users(id),
  report_id uuid not null references needs_report(id),
  title varchar(300) not null,
  description text default '',
  required_skills text[] not null default '{}',
  estimated_hours numeric(5,2),
  deadline timestamptz not null,
  location_text varchar(240) not null,
  lat double precision,
  lng double precision,
  volunteer_slots integer not null default 1,
  status varchar(30) not null default 'open',
  approval_status varchar(20) not null default 'pending', -- pending|approved|rejected
  rejection_note text,
  reporter_clerk_id varchar(200),
  assigned_to uuid references volunteers(id),
  completion_note text,
  completion_image_url text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  actor_label varchar(120) not null,
  from_status varchar(30),
  to_status varchar(30) not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  status varchar(20) not null default 'assigned', -- assigned|completed
  completion_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, volunteer_id)
);

create table if not exists volunteer_requests (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  need_id uuid references needs_report(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  status varchar(20) not null default 'pending', -- pending|approved|rejected
  note text default '',
  coordinator_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint volunteer_requests_target_check check (need_id is not null or task_id is not null)
);

create index if not exists idx_needs_urgency_created
  on needs_report (urgency_score desc, created_at desc);

create index if not exists idx_needs_reporter
  on needs_report (reporter_clerk_id, created_at desc);

create index if not exists idx_needs_status
  on needs_report (status, created_at desc);

create index if not exists idx_tasks_status_created
  on tasks (status, created_at desc);

create index if not exists idx_task_events_task_created
  on task_events (task_id, created_at asc);

create index if not exists idx_task_assignments_task_created
  on task_assignments (task_id, created_at asc);

create index if not exists idx_task_assignments_volunteer_created
  on task_assignments (volunteer_id, created_at desc);

create index if not exists idx_volunteer_requests_status_created
  on volunteer_requests (status, created_at desc);

create index if not exists idx_volunteer_requests_volunteer_created
  on volunteer_requests (volunteer_id, created_at desc);

-- Run this migration if the table already exists:
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS reporter_clerk_id varchar(200);
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS rejection_note text;
-- ALTER TABLE needs_report ALTER COLUMN status SET DEFAULT 'pending';
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS client_captured_at timestamptz;
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS urgency_confidence integer;
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS urgency_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS urgency_override_score numeric(4,2);
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS urgency_override_note text;
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS urgency_override_by varchar(120);
-- ALTER TABLE needs_report ADD COLUMN IF NOT EXISTS urgency_override_at timestamptz;
-- ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS clerk_id varchar(200);
-- ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'pending';
-- ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS rejection_note text;
-- ALTER TABLE volunteers ALTER COLUMN is_active SET DEFAULT false;
