-- Adina — update: Lookbook (finished-work photos shown on the booking page,
-- including photos uploaded straight to the Lookbook).
-- Requires 2026-09-27-photos.sql. Safe to run more than once.
-- Paste ALL of this into Supabase → SQL Editor → New query → Run.

-- Lookbook: finished-work photos the business chooses to show on its booking
-- page. "portfolio" photos are uploaded straight to the Lookbook (no customer or
-- appointment). Customer reference photos can never be published.
alter table public.appointment_photos add column if not exists published boolean not null default false;
alter table public.appointment_photos add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.appointment_photos alter column customer_id drop not null;
alter table public.appointment_photos drop constraint if exists appointment_photos_kind_check;
alter table public.appointment_photos add constraint appointment_photos_kind_check check (kind in ('reference', 'result', 'portfolio'));
alter table public.appointment_photos drop constraint if exists appointment_photos_published_result;
alter table public.appointment_photos drop constraint if exists appointment_photos_published_kind;
alter table public.appointment_photos add constraint appointment_photos_published_kind check (not published or kind in ('result', 'portfolio'));
alter table public.appointment_photos drop constraint if exists appointment_photos_customer_kind;
alter table public.appointment_photos add constraint appointment_photos_customer_kind check ((kind = 'portfolio') = (customer_id is null));
update public.appointment_photos p set service_id = a.service_id
  from public.appointments a where p.appointment_id = a.id and p.service_id is null;
create index if not exists appointment_photos_lookbook_idx on public.appointment_photos(business_id, created_at desc) where published;

notify pgrst, 'reload schema';
