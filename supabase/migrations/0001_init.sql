-- Calendue init: profiles, deadlines, parse_sessions + RLS (spec data model).
-- Trust rule: every read/write scoped to auth.uid() = user_id.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.parse_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_text text not null,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  type text not null default 'assignment'
    check (type in ('assignment', 'exam', 'meeting', 'personal', 'reminder')),
  module text,
  color text,
  done boolean not null default false,
  source text not null default 'manual'
    check (source in ('paste', 'manual', 'email', 'github', 'agent')),
  parse_confidence numeric,
  parse_session_id uuid references public.parse_sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deadlines_user_due_idx
  on public.deadlines (user_id, due_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deadlines_set_updated_at on public.deadlines;
create trigger deadlines_set_updated_at
  before update on public.deadlines
  for each row execute function public.set_updated_at();

-- RLS: private per user (spec privacy decision).
alter table public.profiles enable row level security;
alter table public.deadlines enable row level security;
alter table public.parse_sessions enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "deadlines_select_own" on public.deadlines
  for select using ((select auth.uid()) = user_id);
create policy "deadlines_insert_own" on public.deadlines
  for insert with check ((select auth.uid()) = user_id);
create policy "deadlines_update_own" on public.deadlines
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "deadlines_delete_own" on public.deadlines
  for delete using ((select auth.uid()) = user_id);

create policy "parse_sessions_select_own" on public.parse_sessions
  for select using ((select auth.uid()) = user_id);
create policy "parse_sessions_insert_own" on public.parse_sessions
  for insert with check ((select auth.uid()) = user_id);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
