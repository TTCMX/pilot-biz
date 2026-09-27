-- Adina — update: book several services in one appointment.
-- Safe to run more than once. Paste ALL of this into Supabase → SQL Editor → New query → Run.

-- Multi-service bookings: one appointment, several services back to back.
-- appointments.service_id holds the main service (for the clean-up buffer),
-- service_label the display name ("Manicure + Pedicure") and
-- appointment_services the breakdown with each service's duration and price.
alter table public.appointments add column if not exists service_label text;
create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  duration_minutes int not null check (duration_minutes between 5 and 1440),
  price numeric(12, 2) not null default 0 check (price >= 0),
  position smallint not null default 0
);
create index if not exists appointment_services_appointment_idx on public.appointment_services(appointment_id, position);

alter table public.appointment_services enable row level security;
drop policy if exists "tenant access" on public.appointment_services;
create policy "tenant access" on public.appointment_services for all
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

notify pgrst, 'reload schema';
