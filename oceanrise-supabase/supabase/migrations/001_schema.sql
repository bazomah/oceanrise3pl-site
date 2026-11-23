-- oceanrise · Supabase schema + Row Level Security
-- Run once in: Supabase Dashboard -> SQL Editor (or `supabase db push`).

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  name text not null default '',
  email text not null default '',
  role text not null check (role in ('ceo','hr','ops','fleet','employee')),
  status text not null default 'active' check (status in ('active','disabled')),
  emp_id text not null default '',
  must_change boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create table if not exists public.employees (id text primary key, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.vehicles (id text primary key, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.licenses (id text primary key, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.requests  (id text primary key, emp_id text not null default '', data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.maint     (id text primary key, emp_id text not null default '', data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists requests_emp_idx on public.requests (emp_id);
create index if not exists maint_emp_idx on public.maint (emp_id);

-- default permission matrix (editable later from the app: Users & Access)
insert into public.settings (key, value) values
 ('perms', '{
  "ceo":      {"overview":"approve","people":"approve","fleet":"approve","ops":"edit","licenses":"edit","approvals":"approve","reports":"edit","alerts":"edit","portal":"edit","users":"edit","settings":"edit"},
  "hr":       {"overview":"view","people":"approve","fleet":"none","ops":"none","licenses":"none","approvals":"approve","reports":"view","alerts":"edit","portal":"edit","users":"none","settings":"none"},
  "ops":      {"overview":"view","people":"none","fleet":"none","ops":"edit","licenses":"none","approvals":"approve","reports":"view","alerts":"edit","portal":"edit","users":"none","settings":"none"},
  "fleet":    {"overview":"view","people":"none","fleet":"edit","ops":"none","licenses":"none","approvals":"approve","reports":"view","alerts":"edit","portal":"edit","users":"none","settings":"none"},
  "employee": {"overview":"none","people":"none","fleet":"none","ops":"none","licenses":"none","approvals":"none","reports":"none","alerts":"view","portal":"edit","users":"none","settings":"none"}
 }'::jsonb),
 ('target', '300'::jsonb),
 ('ops', 'null'::jsonb)
on conflict (key) do nothing;

-- ---------- helpers (SECURITY DEFINER so policies can read profiles/settings) ----------
-- A user counts only if the profile is active AND the temporary password was already changed.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active' and not must_change
$$;

create or replace function public.app_emp() returns text
language sql stable security definer set search_path = public as $$
  select emp_id from public.profiles where id = auth.uid() and status = 'active' and not must_change
$$;

create or replace function public.can_do(page text, lvl text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case lvl
      when 'view' then p in ('view','edit','approve')
      when 'edit' then p in ('edit','approve')
      else p = 'approve' end
    from (select ((select value from public.settings where key = 'perms') -> public.app_role()) ->> page as p) x
  ), false)
$$;

-- ---------- RLS ----------
alter table public.settings  enable row level security;
alter table public.profiles  enable row level security;
alter table public.employees enable row level security;
alter table public.vehicles  enable row level security;
alter table public.licenses  enable row level security;
alter table public.requests  enable row level security;
alter table public.maint     enable row level security;

-- settings: everyone signed in reads; perms by Users editors, ops/target by Operations editors
create policy settings_read  on public.settings for select to authenticated using (public.app_role() is not null);
create policy settings_write on public.settings for insert to authenticated with check (
  (key = 'perms' and public.can_do('users','edit')) or (key in ('ops','target') and public.can_do('ops','edit')));
create policy settings_upd   on public.settings for update to authenticated
  using      ((key = 'perms' and public.can_do('users','edit')) or (key in ('ops','target') and public.can_do('ops','edit')))
  with check ((key = 'perms' and public.can_do('users','edit')) or (key in ('ops','target') and public.can_do('ops','edit')));

-- profiles: own row always readable (the app needs it to force the password change);
-- staff read everyone; only Users editors update. Create/delete only via Edge Functions (service role).
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or (public.app_role() is not null and public.app_role() <> 'employee'));
create policy profiles_upd  on public.profiles for update to authenticated
  using (public.can_do('users','edit')) with check (public.can_do('users','edit'));

-- employees: staff read all, an employee reads only their own record
create policy emp_read  on public.employees for select to authenticated using (
  public.app_role() is not null and (public.app_role() <> 'employee' or id = public.app_emp()));
create policy emp_ins   on public.employees for insert to authenticated with check (public.can_do('people','edit') or public.can_do('fleet','edit'));
create policy emp_upd   on public.employees for update to authenticated using (public.can_do('people','edit') or public.can_do('fleet','edit')) with check (public.can_do('people','edit') or public.can_do('fleet','edit'));
create policy emp_del   on public.employees for delete to authenticated using (public.can_do('people','edit'));

-- vehicles: any signed-in user reads; Fleet editors write
create policy veh_read on public.vehicles for select to authenticated using (public.app_role() is not null);
create policy veh_ins  on public.vehicles for insert to authenticated with check (public.can_do('fleet','edit'));
create policy veh_upd  on public.vehicles for update to authenticated using (public.can_do('fleet','edit')) with check (public.can_do('fleet','edit'));
create policy veh_del  on public.vehicles for delete to authenticated using (public.can_do('fleet','edit'));

-- licenses: staff read, Licenses editors write
create policy lic_read on public.licenses for select to authenticated using (public.app_role() is not null and public.app_role() <> 'employee');
create policy lic_ins  on public.licenses for insert to authenticated with check (public.can_do('licenses','edit'));
create policy lic_upd  on public.licenses for update to authenticated using (public.can_do('licenses','edit')) with check (public.can_do('licenses','edit'));
create policy lic_del  on public.licenses for delete to authenticated using (public.can_do('licenses','edit'));

-- requests (leave, tasks, ...): staff read all; an employee reads/creates/updates only their own
create policy req_read on public.requests for select to authenticated using (
  public.app_role() is not null and (public.app_role() <> 'employee' or emp_id = public.app_emp()));
create policy req_ins  on public.requests for insert to authenticated with check (
  public.app_role() is not null and (emp_id = public.app_emp() or public.can_do('approvals','edit') or public.can_do('people','edit')));
create policy req_upd  on public.requests for update to authenticated
  using      (public.app_role() is not null and (emp_id = public.app_emp() or public.can_do('approvals','edit') or public.can_do('people','edit')))
  with check (public.app_role() is not null and (emp_id = public.app_emp() or public.can_do('approvals','edit') or public.can_do('people','edit')));
create policy req_del  on public.requests for delete to authenticated using (public.can_do('approvals','edit') or public.can_do('people','edit'));

-- vehicle maintenance: staff read all; an employee reads/creates only their own; Fleet editors manage
create policy mnt_read on public.maint for select to authenticated using (
  public.app_role() is not null and (public.app_role() <> 'employee' or emp_id = public.app_emp()));
create policy mnt_ins  on public.maint for insert to authenticated with check (
  public.app_role() is not null and (emp_id = public.app_emp() or public.can_do('fleet','edit')));
create policy mnt_upd  on public.maint for update to authenticated using (public.can_do('fleet','edit')) with check (public.can_do('fleet','edit'));
create policy mnt_del  on public.maint for delete to authenticated using (public.can_do('fleet','edit'));

-- deleting an employee disables the linked login automatically
create or replace function public.on_employee_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set status = 'disabled' where emp_id = old.id;
  return old;
end $$;
drop trigger if exists trg_employee_deleted on public.employees;
create trigger trg_employee_deleted after delete on public.employees for each row execute function public.on_employee_deleted();

-- nothing is readable without signing in
revoke all on all tables in schema public from anon;
