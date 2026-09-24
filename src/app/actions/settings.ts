"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { getCountry, isLanguage, isValidTimezone } from "@/lib/i18n/countries";
import { isValidSlug } from "@/lib/slug";
import { toE164 } from "@/lib/phone";
import { BUSINESS_TYPES } from "@/lib/templates";
import { audit } from "@/lib/audit";
import { fail, ok, type ActionResult } from "./result";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().toLowerCase(),
  business_type: z.enum(BUSINESS_TYPES),
  country: z.string().length(2),
  city: z.string().trim().max(100).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().refine(isValidTimezone),
  language: z.string().refine((l) => isLanguage(l)),
  week_start: z.coerce.number().int().min(1).max(7),
  slot_interval_minutes: z.coerce.number().int().min(5).max(120),
  min_notice_minutes: z.coerce.number().int().min(0).max(60 * 24 * 14),
  max_advance_days: z.coerce.number().int().min(1).max(365),
});

export async function updateBusiness(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const v = parsed.data;
  if (!getCountry(v.country)) return fail("errors.invalid");
  if (!isValidSlug(v.slug)) return fail("errors.invalid_slug");
  const { business, supabase, user } = await requireBusiness();

  const { error } = await supabase
    .from("businesses")
    .update({
      ...v,
      country: v.country.toUpperCase(),
      city: v.city || null,
      address: v.address || null,
      phone: toE164(v.phone, v.country),
      locale: `${v.language}-${v.country.toUpperCase()}`,
    })
    .eq("id", business.id);
  if (error) return fail(error.code === "23505" ? "errors.slug_taken" : error.message);

  if (v.currency !== business.currency) {
    // Keep service prices in the business currency (amounts are not converted).
    await supabase.from("services").update({ currency: v.currency }).eq("business_id", business.id);
  }
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: "update", entity: "business", entity_id: business.id });
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function uploadLogo(form: FormData): Promise<ActionResult> {
  const file = form.get("logo");
  if (!(file instanceof File) || !file.size) return fail("errors.invalid");
  if (file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) return fail("errors.invalid_image");
  const { business, supabase } = await requireBusiness();
  const ext = file.type.split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg");
  const path = `${business.id}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: true });
  if (error) return fail(error.message);
  const { data } = supabase.storage.from("logos").getPublicUrl(path);
  await supabase.from("businesses").update({ logo_url: data.publicUrl }).eq("id", business.id);
  revalidatePath("/", "layout");
  return ok(undefined);
}
