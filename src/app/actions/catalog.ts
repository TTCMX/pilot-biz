"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { audit } from "@/lib/audit";
import { STAFF_COLORS } from "@/lib/templates";
import { toE164 } from "@/lib/phone";
import { fail, ok, type ActionResult } from "./result";

const uuid = z.uuid();

// ---------------- Services ----------------

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  duration_minutes: z.coerce.number().int().min(5).max(1440),
  buffer_minutes: z.coerce.number().int().min(0).max(240).default(0),
  price: z.coerce.number().min(0).max(10_000_000),
  category: z.string().trim().max(60).optional().nullable(),
  active: z.boolean().default(true),
  staffIds: z.array(uuid).default([]),
});

export async function saveService(input: z.input<typeof serviceSchema>, id?: string): Promise<ActionResult<{ id: string }>> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness();
  const { staffIds, ...row } = parsed.data;
  const values = { ...row, description: row.description || null, category: row.category || null, currency: business.currency };

  const res = id
    ? await supabase.from("services").update(values).eq("id", id).eq("business_id", business.id).select("id").single()
    : await supabase.from("services").insert({ ...values, business_id: business.id }).select("id").single();
  if (res.error) return fail(res.error.message);
  const serviceId = res.data.id;

  await supabase.from("staff_services").delete().eq("service_id", serviceId).eq("business_id", business.id);
  if (staffIds.length) {
    const { error } = await supabase.from("staff_services").insert(staffIds.map((staff_id) => ({ business_id: business.id, staff_id, service_id: serviceId })));
    if (error) return fail(error.message);
  }
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: id ? "update" : "create", entity: "service", entity_id: serviceId });
  revalidatePath("/services");
  return ok({ id: serviceId });
}

export async function deleteService(id: string): Promise<ActionResult> {
  const { business, supabase, user } = await requireBusiness();
  // Services with history are archived instead of deleted.
  const { error } = await supabase.from("services").delete().eq("id", id).eq("business_id", business.id);
  if (error) await supabase.from("services").update({ active: false }).eq("id", id).eq("business_id", business.id);
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: error ? "archive" : "delete", entity: "service", entity_id: id });
  revalidatePath("/services");
  return ok(undefined);
}

// ---------------- Staff ----------------

const staffSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.string().trim().max(60).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  active: z.boolean().default(true),
  serviceIds: z.array(uuid).default([]),
});

export async function saveStaff(input: z.input<typeof staffSchema>, id?: string): Promise<ActionResult<{ id: string }>> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness();
  const { serviceIds, ...row } = parsed.data;
  const values = { ...row, email: row.email || null, phone: toE164(row.phone, business.country), role: row.role || null };

  let staffId = id;
  if (id) {
    const { error } = await supabase.from("staff").update(values).eq("id", id).eq("business_id", business.id);
    if (error) return fail(error.message);
  } else {
    const { count } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", business.id);
    const { data, error } = await supabase
      .from("staff")
      .insert({ ...values, color: values.color ?? STAFF_COLORS[(count ?? 0) % STAFF_COLORS.length], sort_order: count ?? 0, business_id: business.id })
      .select("id")
      .single();
    if (error) return fail(error.message);
    staffId = data.id;
    // New professionals start with the hours of the first professional.
    const { data: first } = await supabase.from("staff").select("id").eq("business_id", business.id).neq("id", staffId).order("sort_order").order("created_at").limit(1).maybeSingle();
    if (first) {
      const { data: rules } = await supabase.from("availability_rules").select("day_of_week, start_time, end_time").eq("staff_id", first.id);
      if (rules?.length) await supabase.from("availability_rules").insert(rules.map((r) => ({ ...r, business_id: business.id, staff_id: staffId })));
    }
    const { count: total } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true);
    if ((total ?? 0) > 1) await supabase.from("businesses").update({ solo_mode: false }).eq("id", business.id);
  }

  await supabase.from("staff_services").delete().eq("staff_id", staffId!).eq("business_id", business.id);
  if (serviceIds.length) {
    const { error } = await supabase.from("staff_services").insert(serviceIds.map((service_id) => ({ business_id: business.id, staff_id: staffId!, service_id })));
    if (error) return fail(error.message);
  }
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: id ? "update" : "create", entity: "staff", entity_id: staffId });
  revalidatePath("/staff");
  return ok({ id: staffId! });
}

const exceptionSchema = z.object({
  staff_id: uuid.nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  type: z.enum(["time_off", "custom_hours"]),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

/** Add a time off / special hours exception (optionally over a date range, e.g. vacations). */
export async function addException(input: z.input<typeof exceptionSchema>): Promise<ActionResult> {
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const v = parsed.data;
  const hasTimes = !!(v.start_time && v.end_time);
  if ((v.type === "custom_hours" && !hasTimes) || (hasTimes && v.end_time! <= v.start_time!)) return fail("errors.invalid_hours");
  const { business, supabase, user } = await requireBusiness();

  const dates: string[] = [];
  const start = new Date(`${v.date}T00:00:00Z`);
  const end = new Date(`${v.end_date || v.date}T00:00:00Z`);
  for (let d = start; d <= end && dates.length < 366; d = new Date(d.getTime() + 86_400_000)) dates.push(d.toISOString().slice(0, 10));
  if (!dates.length) return fail("errors.invalid");

  const { error } = await supabase.from("availability_exceptions").insert(
    dates.map((date) => ({
      business_id: business.id,
      staff_id: v.staff_id,
      date,
      type: v.type,
      start_time: hasTimes ? v.start_time : null,
      end_time: hasTimes ? v.end_time : null,
      note: v.note || null,
    })),
  );
  if (error) return fail(error.message);
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: "create", entity: "availability_exception", data: v });
  revalidatePath("/staff");
  return ok(undefined);
}

export async function deleteException(id: string): Promise<ActionResult> {
  const { business, supabase } = await requireBusiness();
  const { error } = await supabase.from("availability_exceptions").delete().eq("id", id).eq("business_id", business.id);
  if (error) return fail(error.message);
  revalidatePath("/staff");
  return ok(undefined);
}
