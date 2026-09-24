"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { BookingError, createAppointment, findOrCreateCustomer, loadBookingData, rescheduleAppointment, slotsFor } from "@/lib/booking/service";
import { audit } from "@/lib/audit";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { fail, ok, type ActionResult } from "./result";

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function revalidate() {
  for (const p of ["/dashboard", "/calendar", "/customers", "/waitlist"]) revalidatePath(p, "layout");
}

function bookingError(e: unknown) {
  if (e instanceof BookingError) return fail(`errors.${e.code}`);
  return fail(e instanceof Error ? e.message : "errors.generic");
}

/** Available start times for the owner (no notice / advance limits). */
export async function getOwnerSlots(input: { serviceId: string; staffId: string | null; date: string; ignoreAppointmentId?: string }): Promise<ActionResult<{ start: string; staffIds: string[] }[]>> {
  if (!uuid.safeParse(input.serviceId).success || !date.safeParse(input.date).success) return fail("errors.invalid");
  const { business, supabase } = await requireBusiness();
  const data = await loadBookingData(supabase, business, input.date, input.date);
  const slots = slotsFor(data, business, input.serviceId, input.staffId, input.date, { ownerMode: true, ignoreAppointmentId: input.ignoreAppointmentId });
  return ok(slots.map((s) => ({ start: s.start, staffIds: s.staffIds })));
}

const createSchema = z.object({
  customerId: uuid.optional().nullable(),
  newCustomer: z.object({ first_name: z.string().trim().min(1).max(100), last_name: z.string().trim().max(100).optional(), phone: z.string().max(40).optional(), email: z.string().max(200).optional() }).optional().nullable(),
  serviceId: uuid,
  staffId: uuid.nullable(),
  startAt: z.iso.datetime({ offset: true }),
  notes: z.string().max(2000).optional().nullable(),
  rebookedFromId: uuid.optional().nullable(),
  waitlistEntryId: uuid.optional().nullable(),
});

export async function createOwnerAppointment(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness();
  const v = parsed.data;
  try {
    let customerId = v.customerId ?? null;
    if (!customerId) {
      if (!v.newCustomer) return fail("errors.customer_required");
      customerId = (await findOrCreateCustomer(supabase, business, { ...v.newCustomer, source: "owner" })).id;
    }
    // Owners can book outside regular hours; the database still prevents overlaps.
    const appt = await createAppointment(supabase, business, {
      serviceId: v.serviceId,
      staffId: v.staffId,
      startAt: v.startAt,
      customerId,
      source: "owner",
      notes: v.notes,
      rebookedFromId: v.rebookedFromId,
      enforceAvailability: false,
      status: "confirmed",
    });
    if (v.waitlistEntryId) {
      await supabase.from("waitlist_entries").update({ status: "booked", appointment_id: appt.id }).eq("id", v.waitlistEntryId).eq("business_id", business.id);
    }
    await audit(supabase, { business_id: business.id, actor_id: user.id, action: "create", entity: "appointment", entity_id: appt.id });
    revalidate();
    return ok({ id: appt.id });
  } catch (e) {
    return bookingError(e);
  }
}

export async function moveAppointment(input: { id: string; startAt: string; staffId?: string | null }): Promise<ActionResult> {
  if (!uuid.safeParse(input.id).success || !z.iso.datetime({ offset: true }).safeParse(input.startAt).success) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness();
  const { data: appt } = await supabase.from("appointments").select("*").eq("id", input.id).eq("business_id", business.id).maybeSingle();
  if (!appt) return fail("errors.not_found");
  try {
    await rescheduleAppointment(supabase, business, appt as Appointment, { startAt: input.startAt, staffId: input.staffId, enforceAvailability: false });
  } catch (e) {
    return bookingError(e);
  }
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: "reschedule", entity: "appointment", entity_id: input.id, data: { from: appt.start_at, to: input.startAt, staff: input.staffId } });
  revalidate();
  return ok(undefined);
}

const STATUSES = ["scheduled", "confirmed", "completed", "cancelled", "no_show"] as const;

export async function setAppointmentStatus(id: string, status: AppointmentStatus): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !STATUSES.includes(status)) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness();
  const { error } = await supabase
    .from("appointments")
    .update({ status, cancelled_at: status === "cancelled" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("business_id", business.id);
  if (error) return fail(error.code === "23P01" ? "errors.slot_taken" : error.message);
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: `status:${status}`, entity: "appointment", entity_id: id });
  revalidate();
  return ok(undefined);
}

export async function updateAppointmentDetails(id: string, input: { notes?: string | null; price?: number }): Promise<ActionResult> {
  const parsed = z.object({ notes: z.string().max(2000).nullable().optional(), price: z.number().min(0).max(10_000_000).optional() }).safeParse(input);
  if (!uuid.safeParse(id).success || !parsed.success) return fail("errors.invalid");
  const { business, supabase } = await requireBusiness();
  const { error } = await supabase.from("appointments").update(parsed.data).eq("id", id).eq("business_id", business.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}
