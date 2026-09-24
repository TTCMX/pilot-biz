"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { toE164 } from "@/lib/phone";
import { audit } from "@/lib/audit";
import { fail, ok, type ActionResult } from "./result";

const customerSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).optional().nullable(),
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function saveCustomer(input: z.input<typeof customerSchema>, id?: string): Promise<ActionResult<{ id: string }>> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness();
  const phone = toE164(parsed.data.phone, business.country);
  if (parsed.data.phone && !phone) return fail("errors.invalid_phone");
  const row = {
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name || null,
    email: parsed.data.email?.toLowerCase() || null,
    phone,
    notes: parsed.data.notes || null,
  };
  const result = id
    ? await supabase.from("customers").update(row).eq("id", id).eq("business_id", business.id).select("id").single()
    : await supabase.from("customers").insert({ ...row, business_id: business.id, source: "owner" }).select("id").single();
  if (result.error) return fail(result.error.message);
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: id ? "update" : "create", entity: "customer", entity_id: result.data.id });
  revalidatePath("/customers");
  return ok({ id: result.data.id });
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const { business, supabase, user } = await requireBusiness();
  const { error } = await supabase.from("customers").delete().eq("id", id).eq("business_id", business.id);
  if (error) return fail(error.message);
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: "delete", entity: "customer", entity_id: id });
  revalidatePath("/customers");
  return ok(undefined);
}

const importSchema = z
  .array(
    z.object({
      first_name: z.string().trim().min(1).max(100),
      last_name: z.string().trim().max(100).optional(),
      email: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(40).optional(),
      notes: z.string().trim().max(2000).optional(),
    }),
  )
  .max(5000);

/** CSV import: normalizes phones, skips duplicates (same phone or email). */
export async function importCustomers(rows: z.input<typeof importSchema>): Promise<ActionResult<{ imported: number; skipped: number }>> {
  const parsed = importSchema.safeParse(rows);
  if (!parsed.success) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness({ allowIncompleteOnboarding: true });

  const { data: existing } = await supabase.from("customers").select("phone, email").eq("business_id", business.id);
  const seenPhones = new Set((existing ?? []).map((c) => c.phone).filter(Boolean));
  const seenEmails = new Set((existing ?? []).map((c) => c.email?.toLowerCase()).filter(Boolean));

  const toInsert = [];
  let skipped = 0;
  for (const r of parsed.data) {
    const phone = toE164(r.phone, business.country);
    const email = r.email && z.email().safeParse(r.email).success ? r.email.toLowerCase() : null;
    if ((phone && seenPhones.has(phone)) || (email && seenEmails.has(email))) {
      skipped++;
      continue;
    }
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);
    toInsert.push({ business_id: business.id, first_name: r.first_name, last_name: r.last_name || null, email, phone, notes: r.notes || null, source: "import" as const });
  }
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from("customers").insert(toInsert.slice(i, i + 500));
    if (error) return fail(error.message);
  }
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: "import", entity: "customer", data: { imported: toInsert.length, skipped } });
  revalidatePath("/customers");
  return ok({ imported: toInsert.length, skipped });
}

/** Quick customer search for pickers (name, phone or email). */
export async function searchCustomers(q: string): Promise<ActionResult<{ id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null }[]>> {
  const { business, supabase } = await requireBusiness();
  const term = q.trim().replace(/[%_,()\\]/g, " ").trim().slice(0, 60);
  let query = supabase.from("customers").select("id, first_name, last_name, phone, email").eq("business_id", business.id).order("first_name").limit(20);
  if (term) {
    const digits = term.replace(/\D/g, "");
    const filters = [`first_name.ilike.%${term}%`, `last_name.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
    query = query.or(filters.join(","));
  }
  const { data, error } = await query;
  if (error) return fail(error.message);
  return ok(data ?? []);
}
