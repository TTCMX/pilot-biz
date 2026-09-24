"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { findOrCreateCustomer } from "@/lib/booking/service";
import { fail, ok, type ActionResult } from "./result";

const uuid = z.uuid();
const time = z.string().regex(/^\d{2}:\d{2}$/);

const schema = z.object({
  customerId: uuid.optional().nullable(),
  newCustomer: z.object({ first_name: z.string().trim().min(1).max(100), last_name: z.string().max(100).optional(), phone: z.string().max(40).optional() }).optional().nullable(),
  serviceId: uuid,
  staffId: uuid.nullable(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  preferredStart: time.nullable(),
  preferredEnd: time.nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function addWaitlistEntry(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const v = parsed.data;
  const { business, supabase } = await requireBusiness();
  let customerId = v.customerId ?? null;
  if (!customerId) {
    if (!v.newCustomer) return fail("errors.customer_required");
    customerId = (await findOrCreateCustomer(supabase, business, { ...v.newCustomer, source: "owner" })).id;
  }
  const { error } = await supabase.from("waitlist_entries").insert({
    business_id: business.id,
    customer_id: customerId,
    service_id: v.serviceId,
    staff_id: v.staffId,
    preferred_date: v.preferredDate,
    preferred_start_time: v.preferredStart,
    preferred_end_time: v.preferredEnd,
    notes: v.notes || null,
    source: "owner",
  });
  if (error) return fail(error.message);
  revalidatePath("/waitlist");
  return ok(undefined);
}

export async function setWaitlistStatus(id: string, status: "active" | "contacted" | "cancelled"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("errors.invalid");
  const { business, supabase } = await requireBusiness();
  const { error } = await supabase.from("waitlist_entries").update({ status }).eq("id", id).eq("business_id", business.id);
  if (error) return fail(error.message);
  revalidatePath("/waitlist");
  revalidatePath("/dashboard");
  return ok(undefined);
}
