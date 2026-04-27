-- Sahayak MVP schema (single-org demo)
create extension if not exists pgcrypto;

create table if not exists needs_report (
  id uuid primary key default gen_random_uuid(),
  title varchar(300) not null,
  description text default '',
  category varchar(50) not null,
  severity_self varchar(20) not null,
  affected_count integer default 0,
  location_text varchar(240) not null,
  lat double precision,
  lng double precision,
  urgency_score numeric(4,2) not null,
  status varchar(30) not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
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
  is_active boolean not null default true,
  total_deployments integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
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
  assigned_to uuid references volunteers(id),
  completion_note text,
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

create index if not exists idx_needs_urgency_created
  on needs_report (urgency_score desc, created_at desc);

create index if not exists idx_tasks_status_created
  on tasks (status, created_at desc);

create index if not exists idx_task_events_task_created
  on task_events (task_id, created_at asc);
