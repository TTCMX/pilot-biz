"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPublicBusiness } from "@/lib/booking/public";
import { BookingError, createAppointment, findOrCreateCustomer, rescheduleAppointment } from "@/lib/booking/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/phone";
import { audit } from "@/lib/audit";
import { notifyAppointment, notifyWaitlist } from "@/lib/notifications";
import type { Appointment } from "@/lib/types";
import { fail, ok, type ActionResult } from "./result";

// Server actions for the anonymous booking page. Every input is validated here;
// availability is re-checked server-side and the DB constraint prevents overlaps.

const uuid = z.uuid();
const contact = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).optional().default(""),
  phone: z.string().trim().min(5).max(40),
  email: z.union([z.email(), z.literal("")]).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  website: z.string().max(0).optional(), // honeypot
});

const bookingSchema = contact.extend({
  slug: z.string().max(60),
  serviceId: uuid,
  staffId: uuid.nullable(),
  startAt: z.iso.datetime({ offset: true }),
  rebookToken: uuid.optional().nullable(),
});

function refresh() {
  for (const p of ["/dashboard", "/calendar", "/customers", "/waitlist"]) revalidatePath(p, "layout");
}

export async function createPublicBooking(input: z.input<typeof bookingSchema>): Promise<ActionResult<{ token: string }>> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const v = parsed.data;
  const business = await getPublicBusiness(v.slug);
  if (!business) return fail("errors.not_found");
  if (!toE164(v.phone, business.country)) return fail("errors.invalid_phone");

  const db = createAdminClient();
  try {
    let rebookedFromId: string | null = null;
    if (v.rebookToken) {
      const { data } = await db.from("appointments").select("id").eq("public_token", v.rebookToken).eq("business_id", business.id).maybeSingle();
      rebookedFromId = data?.id ?? null;
    }
    const customer = await findOrCreateCustomer(db, business, { ...v, source: "booking_page" });
    const appt = await createAppointment(db, business, {
      serviceId: v.serviceId,
      staffId: v.staffId,
      startAt: v.startAt,
      customerId: customer.id,
      source: "booking_page",
      notes: v.notes,
      rebookedFromId,
      enforceAvailability: true,
    });
    await audit(db, { business_id: business.id, actor_id: null, action: "create", entity: "appointment", entity_id: appt.id, data: { source: "booking_page" } });
    notifyAppointment("booked", appt.id);
    refresh();
    return ok({ token: appt.public_token });
  } catch (e) {
    if (e instanceof BookingError) return fail(`errors.${e.code}`);
    console.error(e);
    return fail("errors.generic");
  }
}

async function loadByToken(slug: string, token: string) {
  if (!uuid.safeParse(token).success) return null;
  const business = await getPublicBusiness(slug);
  if (!business) return null;
  const db = createAdminClient();
  const { data } = await db.from("appointments").select("*").eq("public_token", token).eq("business_id", business.id).maybeSingle();
  return data ? { business, db, appt: data as Appointment } : null;
}

export async function cancelPublicBooking(slug: string, token: string): Promise<ActionResult> {
  const ctx = await loadByToken(slug, token);
  if (!ctx) return fail("errors.not_found");
  const { appt, db, business } = ctx;
  if (!["scheduled", "confirmed"].includes(appt.status) || Date.parse(appt.start_at) < Date.now()) return fail("errors.cannot_change");
  await db.from("appointments").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", appt.id);
  await audit(db, { business_id: business.id, actor_id: null, action: "status:cancelled", entity: "appointment", entity_id: appt.id, data: { by: "customer" } });
  notifyAppointment("cancelled", appt.id);
  refresh();
  revalidatePath(`/${slug}/a/${token}`);
  return ok(undefined);
}

export async function reschedulePublicBooking(slug: string, token: string, startAt: string): Promise<ActionResult> {
  if (!z.iso.datetime({ offset: true }).safeParse(startAt).success) return fail("errors.invalid");
  const ctx = await loadByToken(slug, token);
  if (!ctx) return fail("errors.not_found");
  const { appt, db, business } = ctx;
  if (!["scheduled", "confirmed"].includes(appt.status) || Date.parse(appt.start_at) < Date.now()) return fail("errors.cannot_change");
  try {
    await rescheduleAppointment(db, business, appt, { startAt, enforceAvailability: true });
    // A customer-initiated change needs the owner's confirmation again.
    await db.from("appointments").update({ status: "scheduled" }).eq("id", appt.id);
  } catch (e) {
    if (e instanceof BookingError) return fail(`errors.${e.code}`);
    return fail("errors.generic");
  }
  await audit(db, { business_id: business.id, actor_id: null, action: "reschedule", entity: "appointment", entity_id: appt.id, data: { by: "customer", from: appt.start_at, to: startAt } });
  notifyAppointment("rescheduled", appt.id);
  refresh();
  revalidatePath(`/${slug}/a/${token}`);
  return ok(undefined);
}

const waitlistSchema = contact.extend({
  slug: z.string().max(60),
  serviceId: uuid,
  staffId: uuid.nullable(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  preferredStart: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  preferredEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

export async function joinPublicWaitlist(input: z.input<typeof waitlistSchema>): Promise<ActionResult> {
  const parsed = waitlistSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const v = parsed.data;
  const business = await getPublicBusiness(v.slug);
  if (!business) return fail("errors.not_found");
  if (!toE164(v.phone, business.country)) return fail("errors.invalid_phone");
  const db = createAdminClient();
  const { data: service } = await db.from("services").select("id").eq("id", v.serviceId).eq("business_id", business.id).maybeSingle();
  if (!service) return fail("errors.not_found");
  if (v.staffId) {
    const { data: staff } = await db.from("staff").select("id").eq("id", v.staffId).eq("business_id", business.id).maybeSingle();
    if (!staff) return fail("errors.not_found");
  }
  const customer = await findOrCreateCustomer(db, business, { ...v, source: "booking_page" });
  const { data: entry, error } = await db.from("waitlist_entries").insert({
    business_id: business.id,
    customer_id: customer.id,
    service_id: v.serviceId,
    staff_id: v.staffId,
    preferred_date: v.preferredDate,
    preferred_start_time: v.preferredStart,
    preferred_end_time: v.preferredEnd,
    notes: v.notes || null,
    source: "booking_page",
  }).select("id").single();
  if (error) return fail("errors.generic");
  notifyWaitlist(entry.id);
  refresh();
  return ok(undefined);
}
