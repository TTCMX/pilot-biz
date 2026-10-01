-- Adina — update: tenant integrity checks (security hardening).
-- Safe to run more than once. Paste ALL of this into Supabase → SQL Editor → New query → Run.

-- ---------------------------------------------------------------------
-- Tenant integrity: every reference must point inside the same business.
-- Foreign keys alone would let one business attach another business's staff,
-- service or customer to its own rows (e.g. blocking someone else's staff
-- through the no-overlap constraint). This trigger rejects that.
-- ---------------------------------------------------------------------
create or replace function public.in_business(tbl text, row_id uuid, bid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare found boolean;
begin
  if row_id is null then return true; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and business_id = $2)', tbl) into found using row_id, bid;
  return found;
end $$;

create or replace function public.check_tenant_refs()
returns trigger language plpgsql security definer set search_path = public as $$
declare ok boolean := true;
begin
  case tg_table_name
    when 'appointments' then
      ok := public.in_business('staff', new.staff_id, new.business_id)
        and public.in_business('services', new.service_id, new.business_id)
        and public.in_business('customers', new.customer_id, new.business_id)
        and public.in_business('appointments', new.rebooked_from_id, new.business_id);
    when 'appointment_services' then
      ok := public.in_business('appointments', new.appointment_id, new.business_id)
        and public.in_business('services', new.service_id, new.business_id);
    when 'appointment_photos' then
      ok := public.in_business('appointments', new.appointment_id, new.business_id)
        and public.in_business('customers', new.customer_id, new.business_id)
        and public.in_business('services', new.service_id, new.business_id);
    when 'waitlist_entries' then
      ok := public.in_business('customers', new.customer_id, new.business_id)
        and public.in_business('services', new.service_id, new.business_id)
        and public.in_business('staff', new.staff_id, new.business_id)
        and public.in_business('appointments', new.appointment_id, new.business_id);
    when 'staff_services' then
      ok := public.in_business('staff', new.staff_id, new.business_id)
        and public.in_business('services', new.service_id, new.business_id);
    when 'availability_rules', 'availability_exceptions' then
      ok := public.in_business('staff', new.staff_id, new.business_id);
    else
      ok := true;
  end case;
  if not ok then
    raise exception 'reference to a record of another business' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists check_tenant_refs on public.appointments;
create trigger check_tenant_refs before insert or update on public.appointments for each row execute function public.check_tenant_refs();
drop trigger if exists check_tenant_refs on public.appointment_services;
create trigger check_tenant_refs before insert or update on public.appointment_services for each row execute function public.check_tenant_refs();
drop trigger if exists check_tenant_refs on public.appointment_photos;
create trigger check_tenant_refs before insert or update on public.appointment_photos for each row execute function public.check_tenant_refs();
drop trigger if exists check_tenant_refs on public.waitlist_entries;
create trigger check_tenant_refs before insert or update on public.waitlist_entries for each row execute function public.check_tenant_refs();
drop trigger if exists check_tenant_refs on public.staff_services;
create trigger check_tenant_refs before insert or update on public.staff_services for each row execute function public.check_tenant_refs();
drop trigger if exists check_tenant_refs on public.availability_rules;
create trigger check_tenant_refs before insert or update on public.availability_rules for each row execute function public.check_tenant_refs();
drop trigger if exists check_tenant_refs on public.availability_exceptions;
create trigger check_tenant_refs before insert or update on public.availability_exceptions for each row execute function public.check_tenant_refs();

revoke all on function public.in_business(text, uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
