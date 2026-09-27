import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import {
  getAvailableSlots,
  pickStaff,
  type AvailabilityException,
  type AvailabilityRule,
  type BusyInterval,
  type Slot,
} from "./engine";
import type { Appointment, Business, Customer, Service, Source, Staff } from "@/lib/types";
import { toE164 } from "@/lib/phone";

// Data access for the booking engine. Works with either the user client (RLS)
// or the admin client (public booking page), always scoped by business_id.

export type BookingData = {
  staff: Staff[];
  services: Service[];
  staffServices: { staff_id: string; service_id: string }[];
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busy: (BusyInterval & { appointment_id: string })[];
};

export async function loadBookingData(
  db: SupabaseClient,
  business: Pick<Business, "id" | "timezone">,
  from: string, // local date
  to: string, // local date (inclusive)
): Promise<BookingData> {
  const start = DateTime.fromISO(from, { zone: business.timezone }).startOf("day").minus({ days: 1 }).toUTC().toISO()!;
  const end = DateTime.fromISO(to, { zone: business.timezone }).plus({ days: 2 }).startOf("day").toUTC().toISO()!;

  const [staff, services, staffServices, rules, exceptions, appts] = await Promise.all([
    db.from("staff").select("*").eq("business_id", business.id).eq("active", true).order("sort_order").order("created_at"),
    db.from("services").select("*").eq("business_id", business.id).eq("active", true).order("sort_order").order("created_at"),
    db.from("staff_services").select("staff_id, service_id").eq("business_id", business.id),
    db.from("availability_rules").select("staff_id, day_of_week, start_time, end_time").eq("business_id", business.id),
    db.from("availability_exceptions").select("staff_id, date, start_time, end_time, type").eq("business_id", business.id).gte("date", from).lte("date", to),
    db
      .from("appointments")
      .select("id, staff_id, start_at, end_at, service:services(buffer_minutes)")
      .eq("business_id", business.id)
      .neq("status", "cancelled")
      .lt("start_at", end)
      .gt("end_at", start),
  ]);

  for (const r of [staff, services, staffServices, rules, exceptions, appts]) if (r.error) throw r.error;

  return {
    staff: (staff.data ?? []) as Staff[],
    services: ((services.data ?? []) as Service[]).map((s) => ({ ...s, price: Number(s.price) })),
    staffServices: staffServices.data ?? [],
    rules: (rules.data ?? []) as AvailabilityRule[],
    exceptions: (exceptions.data ?? []) as AvailabilityException[],
    busy: (appts.data ?? []).map((a) => {
      const buffer = ((a.service as unknown as { buffer_minutes: number } | null)?.buffer_minutes ?? 0) * 60_000;
      return { appointment_id: a.id, staff_id: a.staff_id, start_at: a.start_at, end_at: new Date(Date.parse(a.end_at) + buffer).toISOString() };
    }),
  };
}

/** Most services a single booking can combine. */
export const MAX_SERVICES_PER_BOOKING = 5;

/** Several services booked back to back with one staff member, as one appointment. */
export type ServiceBundle = {
  services: Service[];
  primary: Service; // the service stored on appointments.service_id (largest buffer)
  durationMinutes: number; // sum of durations
  bufferMinutes: number; // largest clean-up buffer
  price: number;
  currency: string;
  label: string | null; // "Manicure + Pedicure" for multi-service bookings, null for one
};

export function bundleFor(data: BookingData, serviceIds: string | string[]): ServiceBundle | null {
  const ids = [...new Set(Array.isArray(serviceIds) ? serviceIds : [serviceIds])];
  if (!ids.length || ids.length > MAX_SERVICES_PER_BOOKING) return null;
  const services = ids.map((id) => data.services.find((s) => s.id === id));
  if (services.some((s) => !s)) return null;
  const list = services as Service[];
  const primary = list.reduce((a, b) => (b.buffer_minutes > a.buffer_minutes ? b : a), list[0]);
  return {
    services: list,
    primary,
    durationMinutes: list.reduce((sum, s) => sum + s.duration_minutes, 0),
    bufferMinutes: primary.buffer_minutes,
    price: list.reduce((sum, s) => sum + Number(s.price), 0),
    currency: list[0].currency,
    label: list.length > 1 ? list.map((s) => s.name).join(" + ") : null,
  };
}

/** Staff members that can perform every one of the services. A service with no assignments can be done by anyone. */
export function eligibleStaff(data: BookingData, serviceIds: string | string[], staffId?: string | null): string[] {
  const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds];
  let staff = data.staff.map((s) => s.id);
  for (const serviceId of ids) {
    const assigned = data.staffServices.filter((ss) => ss.service_id === serviceId).map((ss) => ss.staff_id);
    if (assigned.length) staff = staff.filter((id) => assigned.includes(id));
  }
  return staffId ? staff.filter((id) => id === staffId) : staff;
}

export type SlotOptions = {
  ignoreAppointmentId?: string; // when rescheduling
  ownerMode?: boolean; // owners ignore notice / advance limits
  durationMinutes?: number; // keep an existing appointment's length when rescheduling
  now?: Date;
};

export function slotsFor(
  data: BookingData,
  business: Pick<Business, "timezone" | "slot_interval_minutes" | "min_notice_minutes" | "max_advance_days">,
  serviceIds: string | string[],
  staffId: string | null,
  date: string,
  opts: SlotOptions = {},
): Slot[] {
  const bundle = bundleFor(data, serviceIds);
  if (!bundle) return [];
  return getAvailableSlots({
    timezone: business.timezone,
    date,
    durationMinutes: opts.durationMinutes ?? bundle.durationMinutes,
    bufferMinutes: bundle.bufferMinutes,
    staffIds: eligibleStaff(data, bundle.services.map((s) => s.id), staffId),
    rules: data.rules,
    exceptions: data.exceptions,
    busy: opts.ignoreAppointmentId ? data.busy.filter((b) => b.appointment_id !== opts.ignoreAppointmentId) : data.busy,
    slotIntervalMinutes: business.slot_interval_minutes,
    now: opts.now,
    minNoticeMinutes: opts.ownerMode ? 0 : business.min_notice_minutes,
    maxAdvanceDays: opts.ownerMode ? undefined : business.max_advance_days,
  });
}

/** Services booked in an appointment (several for multi-service bookings). */
export async function appointmentServiceIds(db: SupabaseClient, appointment: Pick<Appointment, "id" | "service_id">): Promise<string[]> {
  const { data } = await db.from("appointment_services").select("service_id").eq("appointment_id", appointment.id).order("position");
  const ids = (data ?? []).map((r) => r.service_id as string | null).filter((id): id is string => !!id);
  return ids.length ? ids : [appointment.service_id];
}

export class BookingError extends Error {
  constructor(public code: "slot_taken" | "invalid" | "not_found") {
    super(code);
  }
}

/** Match an existing customer by phone or email, otherwise create one. */
export async function findOrCreateCustomer(
  db: SupabaseClient,
  business: Pick<Business, "id" | "country">,
  input: { first_name: string; last_name?: string | null; email?: string | null; phone?: string | null; notes?: string | null; source: Source },
): Promise<Customer> {
  const phone = toE164(input.phone, business.country);
  const email = input.email?.trim().toLowerCase() || null;

  let existing: Customer | null = null;
  if (phone) {
    const r = await db.from("customers").select("*").eq("business_id", business.id).eq("phone", phone).limit(1).maybeSingle();
    existing = r.data as Customer | null;
  }
  if (!existing && email) {
    const r = await db.from("customers").select("*").eq("business_id", business.id).ilike("email", email.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
    existing = r.data as Customer | null;
  }
  if (existing) {
    // Fill missing contact data without overwriting what the owner has.
    const patch: Record<string, string> = {};
    if (!existing.phone && phone) patch.phone = phone;
    if (!existing.email && email) patch.email = email;
    if (!existing.last_name && input.last_name) patch.last_name = input.last_name.trim();
    if (Object.keys(patch).length) await db.from("customers").update(patch).eq("id", existing.id);
    return { ...existing, ...patch };
  }

  const { data, error } = await db
    .from("customers")
    .insert({
      business_id: business.id,
      first_name: input.first_name.trim(),
      last_name: input.last_name?.trim() || null,
      email,
      phone,
      notes: input.notes?.trim() || null,
      source: input.source,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function createAppointment(
  db: SupabaseClient,
  business: Business,
  input: {
    serviceIds: string[]; // one or more, performed back to back
    staffId: string | null; // null = any
    startAt: string;
    customerId: string;
    source: Source;
    notes?: string | null;
    rebookedFromId?: string | null;
    enforceAvailability: boolean;
    status?: Appointment["status"];
  },
): Promise<Appointment> {
  const date = DateTime.fromISO(input.startAt, { zone: "utc" }).setZone(business.timezone).toISODate()!;
  const data = await loadBookingData(db, business, date, date);
  const bundle = bundleFor(data, input.serviceIds);
  if (!bundle) throw new BookingError("not_found");
  const ids = bundle.services.map((s) => s.id);

  let staffId = input.staffId;
  if (input.enforceAvailability) {
    const slot = slotsFor(data, business, ids, staffId, date).find((s) => Date.parse(s.start) === Date.parse(input.startAt));
    if (!slot) throw new BookingError("slot_taken");
    staffId = staffId ?? pickStaff(slot, data.busy);
  } else if (!staffId) {
    staffId = eligibleStaff(data, ids)[0] ?? data.staff[0]?.id ?? null;
  }
  if (!staffId) throw new BookingError("invalid");

  const start = new Date(input.startAt);
  const end = new Date(start.getTime() + bundle.durationMinutes * 60_000);
  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      business_id: business.id,
      customer_id: input.customerId,
      staff_id: staffId,
      service_id: bundle.primary.id,
      service_label: bundle.label,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: input.status ?? "scheduled",
      price: bundle.price,
      currency: bundle.currency,
      source: input.source,
      notes: input.notes?.trim() || null,
      rebooked_from_id: input.rebookedFromId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23P01") throw new BookingError("slot_taken");
    throw error;
  }
  if (bundle.services.length > 1) {
    const { error: itemsError } = await db.from("appointment_services").insert(
      bundle.services.map((s, position) => ({
        business_id: business.id,
        appointment_id: appt.id,
        service_id: s.id,
        name: s.name,
        duration_minutes: s.duration_minutes,
        price: s.price,
        position,
      })),
    );
    if (itemsError) console.error("[booking] could not save the service breakdown", itemsError);
  }
  return appt as Appointment;
}

/** Move an appointment (time and/or staff). Duration is kept. */
export async function rescheduleAppointment(
  db: SupabaseClient,
  business: Business,
  appointment: Pick<Appointment, "id" | "service_id" | "staff_id" | "start_at" | "end_at">,
  input: { startAt: string; staffId?: string | null; enforceAvailability: boolean },
): Promise<void> {
  const staffId = input.staffId ?? appointment.staff_id;
  if (input.enforceAvailability) {
    const date = DateTime.fromISO(input.startAt, { zone: "utc" }).setZone(business.timezone).toISODate()!;
    const data = await loadBookingData(db, business, date, date);
    const serviceIds = await appointmentServiceIds(db, appointment);
    const durationMinutes = Math.round((Date.parse(appointment.end_at) - Date.parse(appointment.start_at)) / 60_000);
    const ok = slotsFor(data, business, serviceIds, staffId, date, { ignoreAppointmentId: appointment.id, durationMinutes }).some(
      (s) => Date.parse(s.start) === Date.parse(input.startAt),
    );
    if (!ok) throw new BookingError("slot_taken");
  }
  const duration = Date.parse(appointment.end_at) - Date.parse(appointment.start_at);
  const start = new Date(input.startAt);
  const { error } = await db
    .from("appointments")
    .update({ start_at: start.toISOString(), end_at: new Date(start.getTime() + duration).toISOString(), staff_id: staffId })
    .eq("id", appointment.id)
    .eq("business_id", business.id);
  if (error) {
    if (error.code === "23P01") throw new BookingError("slot_taken");
    throw error;
  }
}
