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

/** Staff members that can perform a service. If no assignments exist yet, everyone can. */
export function eligibleStaff(data: BookingData, serviceId: string, staffId?: string | null): string[] {
  const assigned = data.staffServices.filter((ss) => ss.service_id === serviceId).map((ss) => ss.staff_id);
  let ids = data.staff.map((s) => s.id).filter((id) => assigned.length === 0 || assigned.includes(id));
  if (staffId) ids = ids.filter((id) => id === staffId);
  return ids;
}

export type SlotOptions = {
  ignoreAppointmentId?: string; // when rescheduling
  ownerMode?: boolean; // owners ignore notice / advance limits
  now?: Date;
};

export function slotsFor(
  data: BookingData,
  business: Pick<Business, "timezone" | "slot_interval_minutes" | "min_notice_minutes" | "max_advance_days">,
  serviceId: string,
  staffId: string | null,
  date: string,
  opts: SlotOptions = {},
): Slot[] {
  const service = data.services.find((s) => s.id === serviceId);
  if (!service) return [];
  return getAvailableSlots({
    timezone: business.timezone,
    date,
    durationMinutes: service.duration_minutes,
    bufferMinutes: service.buffer_minutes,
    staffIds: eligibleStaff(data, serviceId, staffId),
    rules: data.rules,
    exceptions: data.exceptions,
    busy: opts.ignoreAppointmentId ? data.busy.filter((b) => b.appointment_id !== opts.ignoreAppointmentId) : data.busy,
    slotIntervalMinutes: business.slot_interval_minutes,
    now: opts.now,
    minNoticeMinutes: opts.ownerMode ? 0 : business.min_notice_minutes,
    maxAdvanceDays: opts.ownerMode ? undefined : business.max_advance_days,
  });
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
    serviceId: string;
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
  const service = data.services.find((s) => s.id === input.serviceId);
  if (!service) throw new BookingError("not_found");

  let staffId = input.staffId;
  if (input.enforceAvailability) {
    const slot = slotsFor(data, business, service.id, staffId, date).find((s) => Date.parse(s.start) === Date.parse(input.startAt));
    if (!slot) throw new BookingError("slot_taken");
    staffId = staffId ?? pickStaff(slot, data.busy);
  } else if (!staffId) {
    staffId = eligibleStaff(data, service.id)[0] ?? data.staff[0]?.id ?? null;
  }
  if (!staffId) throw new BookingError("invalid");

  const start = new Date(input.startAt);
  const end = new Date(start.getTime() + service.duration_minutes * 60_000);
  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      business_id: business.id,
      customer_id: input.customerId,
      staff_id: staffId,
      service_id: service.id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: input.status ?? "scheduled",
      price: service.price,
      currency: service.currency,
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
    const ok = slotsFor(data, business, appointment.service_id, staffId, date, { ignoreAppointmentId: appointment.id }).some(
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
