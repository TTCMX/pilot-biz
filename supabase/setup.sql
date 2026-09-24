-- =====================================================================
-- Pilot Biz — full database setup (single pass)
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- It is idempotent: running it again is safe (it upgrades in place).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Users (profile mirror of auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already existed before this script.
insert into public.profiles (id, name, email)
select u.id, coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)), u.email
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Business (tenant)
-- ---------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$'),
  business_type text not null default 'other',
  country text not null check (char_length(country) = 2),
  city text,
  currency text not null check (char_length(currency) = 3),
  timezone text not null,
  locale text not null,
  language text not null,
  address text,
  phone text,
  logo_url text,
  week_start smallint not null default 1 check (week_start between 1 and 7),
  solo_mode boolean not null default true,
  slot_interval_minutes int not null default 15 check (slot_interval_minutes between 5 and 120),
  min_notice_minutes int not null default 60 check (min_notice_minutes >= 0),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  onboarding_completed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index if not exists business_members_user_idx on public.business_members(user_id);

-- Membership check used by every RLS policy (security definer avoids recursion).
create or replace function public.is_business_member(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = bid and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- Staff, services
-- ---------------------------------------------------------------------
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  role text,
  color text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_business_idx on public.staff(business_id);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes int not null check (duration_minutes between 5 and 1440),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 240),
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text not null check (char_length(currency) = 3),
  category text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists services_business_idx on public.services(business_id);

create table if not exists public.staff_services (
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);
create index if not exists staff_services_service_idx on public.staff_services(service_id);

-- ---------------------------------------------------------------------
-- Availability (separate from appointments)
-- day_of_week uses ISO numbering: 1 = Monday … 7 = Sunday.
-- Times are local to the business timezone.
-- ---------------------------------------------------------------------
create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists availability_rules_staff_idx on public.availability_rules(staff_id);

-- type:
--   time_off     → blocks the staff member (whole day when times are null)
--   custom_hours → replaces the regular hours for that date
-- staff_id null  → applies to the whole business (e.g. holiday)
create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  type text not null check (type in ('time_off', 'custom_hours')),
  note text,
  created_at timestamptz not null default now(),
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and end_time > start_time)),
  check (type = 'time_off' or start_time is not null)
);
create index if not exists availability_exceptions_idx on public.availability_exceptions(business_id, date);

-- ---------------------------------------------------------------------
-- Customers
-- Derived metrics (visits, spend…) are computed in the customer_stats view.
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  first_name text not null,
  last_name text,
  email text,
  phone text, -- E.164
  notes text,
  source text not null default 'owner' check (source in ('owner', 'booking_page', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customers_business_idx on public.customers(business_id);
create index if not exists customers_phone_idx on public.customers(business_id, phone);
create index if not exists customers_email_idx on public.customers(business_id, lower(email));

-- ---------------------------------------------------------------------
-- Appointments (central entity)
-- ---------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text not null check (char_length(currency) = 3),
  source text not null default 'owner' check (source in ('owner', 'booking_page', 'import')),
  notes text,
  public_token uuid not null default gen_random_uuid() unique,
  rebooked_from_id uuid references public.appointments(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists appointments_business_start_idx on public.appointments(business_id, start_at);
create index if not exists appointments_customer_idx on public.appointments(customer_id, start_at);
create index if not exists appointments_staff_idx on public.appointments(staff_id, start_at);

-- Hard guarantee against double booking (even under concurrent requests).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (staff_id with =, tstzrange(start_at, end_at, '[)') with &&)
      where (status <> 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Waitlist
-- ---------------------------------------------------------------------
create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null, -- null = any
  preferred_date date,
  preferred_start_time time,
  preferred_end_time time,
  notes text,
  status text not null default 'active' check (status in ('active', 'contacted', 'booked', 'cancelled')),
  appointment_id uuid references public.appointments(id) on delete set null,
  source text not null default 'owner' check (source in ('owner', 'booking_page')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists waitlist_business_idx on public.waitlist_entries(business_id, status);

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_business_idx on public.audit_log(business_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','businesses','staff','services','customers','appointments','waitlist_entries']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Derived customer metrics (never stored, always computed)
-- ---------------------------------------------------------------------
create or replace view public.customer_stats with (security_invoker = true) as
select
  c.id as customer_id,
  c.business_id,
  count(a.id) filter (where a.status = 'completed')::int as visit_count,
  coalesce(sum(a.price) filter (where a.status = 'completed'), 0)::numeric(12,2) as total_spend,
  coalesce(avg(a.price) filter (where a.status = 'completed'), 0)::numeric(12,2) as average_ticket,
  min(a.start_at) filter (where a.status = 'completed') as first_visit,
  max(a.start_at) filter (where a.status = 'completed') as last_visit,
  min(a.start_at) filter (where a.status in ('scheduled', 'confirmed') and a.start_at >= now()) as next_appointment,
  count(a.id) filter (where a.status = 'cancelled')::int as cancellation_count,
  count(a.id) filter (where a.status = 'no_show')::int as no_show_count
from public.customers c
left join public.appointments a on a.customer_id = c.id
group by c.id, c.business_id;

-- ---------------------------------------------------------------------
-- Row Level Security (tenant isolation)
-- Public booking never touches tables with the anon key: it goes through
-- the Next.js server using the service role key, which validates input.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.staff enable row level security;
alter table public.services enable row level security;
alter table public.staff_services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles for select using (id = auth.uid());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "business members read" on public.businesses;
create policy "business members read" on public.businesses for select using (public.is_business_member(id));
drop policy if exists "business members update" on public.businesses;
create policy "business members update" on public.businesses for update
  using (public.is_business_member(id)) with check (public.is_business_member(id));

drop policy if exists "membership self read" on public.business_members;
create policy "membership self read" on public.business_members for select
  using (user_id = auth.uid() or public.is_business_member(business_id));

do $$
declare t text;
begin
  foreach t in array array['staff','services','staff_services','availability_rules','availability_exceptions','customers','appointments','waitlist_entries']
  loop
    execute format('drop policy if exists "tenant access" on public.%I', t);
    execute format(
      'create policy "tenant access" on public.%I for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id))',
      t
    );
  end loop;
end $$;

drop policy if exists "audit read" on public.audit_log;
create policy "audit read" on public.audit_log for select using (public.is_business_member(business_id));
drop policy if exists "audit insert" on public.audit_log;
create policy "audit insert" on public.audit_log for insert
  with check (public.is_business_member(business_id) and actor_id = auth.uid());

-- ---------------------------------------------------------------------
-- Create a business + owner membership atomically
-- ---------------------------------------------------------------------
create or replace function public.create_business(
  p_name text,
  p_slug text,
  p_business_type text,
  p_country text,
  p_city text,
  p_currency text,
  p_timezone text,
  p_locale text,
  p_language text,
  p_week_start smallint
) returns public.businesses
language plpgsql security definer set search_path = public as $$
declare
  b public.businesses;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.businesses (name, slug, business_type, country, city, currency, timezone, locale, language, week_start, created_by)
  values (p_name, p_slug, p_business_type, upper(p_country), p_city, upper(p_currency), p_timezone, p_locale, p_language, p_week_start, uid)
  returning * into b;

  insert into public.business_members (business_id, user_id, role) values (b.id, uid, 'owner');
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id)
  values (b.id, uid, 'create', 'business', b.id);
  return b;
end $$;

revoke all on function public.create_business(text,text,text,text,text,text,text,text,text,smallint) from public, anon;
grant execute on function public.create_business(text,text,text,text,text,text,text,text,text,smallint) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: public bucket for business logos
-- Files live under "<business_id>/..." and only members can write them.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

drop policy if exists "logos public read" on storage.objects;
create policy "logos public read" on storage.objects for select using (bucket_id = 'logos');

drop policy if exists "logos member write" on storage.objects;
create policy "logos member write" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_business_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "logos member update" on storage.objects;
create policy "logos member update" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_business_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "logos member delete" on storage.objects;
create policy "logos member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_business_member(((storage.foldername(name))[1])::uuid));

-- Make the new tables/functions visible to the API immediately.
notify pgrst, 'reload schema';

-- Done ✅
