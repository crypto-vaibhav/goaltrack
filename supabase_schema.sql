-- ============================================================
-- AtomQuest Goal Portal — Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- 1. USERS TABLE
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  role text not null check (role in ('employee','manager','admin')),
  department text,
  manager_id uuid references users(id),
  created_at timestamptz default now()
);

-- 2. GOAL CYCLES (controlled by Admin)
create table if not exists goal_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phase text not null check (phase in ('goal_setting','q1','q2','q3','q4')),
  opens_at date not null,
  closes_at date,
  is_active boolean default false,
  created_at timestamptz default now()
);

-- 3. GOALS TABLE
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references users(id) not null,
  cycle_id uuid references goal_cycles(id),
  thrust_area text not null,
  title text not null,
  description text,
  uom_type text not null check (uom_type in ('numeric_min','numeric_max','timeline','zero')),
  target_value numeric,
  target_date date,
  weightage numeric not null check (weightage >= 10 and weightage <= 100),
  status text default 'draft' check (status in ('draft','submitted','approved','rejected','locked')),
  is_shared boolean default false,
  shared_from_goal_id uuid references goals(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. ACHIEVEMENTS (quarterly actuals)
create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) not null,
  quarter text not null check (quarter in ('q1','q2','q3','q4')),
  actual_value numeric,
  actual_date date,
  progress_status text default 'not_started' check (progress_status in ('not_started','on_track','completed')),
  score numeric,
  updated_at timestamptz default now(),
  unique(goal_id, quarter)
);

-- 5. MANAGER CHECK-INS
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid references users(id) not null,
  employee_id uuid references users(id) not null,
  quarter text not null,
  comment text not null,
  created_at timestamptz default now()
);

-- 6. ESCALATIONS (rule-based escalation log)
create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  entity_type text not null check (entity_type in ('goal','employee')),
  entity_id uuid not null,
  employee_id uuid references users(id),
  escalated_to text not null check (escalated_to in ('manager','admin','employee')),
  message text not null,
  status text default 'open' check (status in ('open','resolved')),
  created_at timestamptz default now()
);

-- 7. AUDIT LOG
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id),
  changed_by uuid references users(id) not null,
  action text not null,
  field_changed text,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);

-- 7. SEED: Default users (password = "password123" for all)
-- NOTE: In a real app use Supabase Auth. For demo, we store plain role info.
insert into users (id, email, name, role, department) values
  ('11111111-1111-1111-1111-111111111111', 'employee@demo.com',  'Arjun Sharma',   'employee', 'Engineering'),
  ('22222222-2222-2222-2222-222222222222', 'manager@demo.com',   'Priya Mehta',    'manager',  'Engineering'),
  ('33333333-3333-3333-3333-333333333333', 'admin@demo.com',     'Rohit Verma',    'admin',    'HR')
on conflict do nothing;

-- Set manager relationship
update users set manager_id = '22222222-2222-2222-2222-222222222222'
  where id = '11111111-1111-1111-1111-111111111111';

-- 8. SEED: Active goal cycle
insert into goal_cycles (id, name, phase, opens_at, is_active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FY 2025-26', 'goal_setting', '2025-05-01', true)
on conflict do nothing;

-- 9. RLS: Disable for demo (enable and configure for production)
alter table users disable row level security;
alter table goals disable row level security;
alter table achievements disable row level security;
alter table checkins disable row level security;
alter table audit_log disable row level security;
alter table escalations disable row level security;
alter table goal_cycles disable row level security;

-- ============================================================
-- DONE. Your tables are ready.
-- ============================================================
