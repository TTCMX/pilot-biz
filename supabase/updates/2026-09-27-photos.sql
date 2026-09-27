-- Adina — update: appointment photos (reference photos from the customer and
-- photos of the finished work). Only needed if you already ran setup.sql
-- before this update; safe to run more than once.
-- Paste ALL of this into Supabase → SQL Editor → New query → Run.

create table if not exists public.appointment_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  kind text not null check (kind in ('reference', 'result')),
  storage_path text not null unique,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists appointment_photos_customer_idx on public.appointment_photos(customer_id, created_at desc);
create index if not exists appointment_photos_appointment_idx on public.appointment_photos(appointment_id);

alter table public.appointment_photos enable row level security;
drop policy if exists "tenant access" on public.appointment_photos;
create policy "tenant access" on public.appointment_photos for all
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
