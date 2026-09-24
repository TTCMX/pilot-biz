"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getProfile, getUser, requireBusiness, getSupabase } from "@/lib/context";
import { inferBusinessSettings, getCountry } from "@/lib/i18n/countries";
import { slugify } from "@/lib/slug";
import { BUSINESS_TYPES, STAFF_COLORS } from "@/lib/templates";
import { audit } from "@/lib/audit";
import type { Business } from "@/lib/types";
import { fail, ok, type ActionResult } from "./result";

const businessSchema = z.object({
  name: z.string().trim().min(1).max(100),
  business_type: z.enum(BUSINESS_TYPES),
  country: z.string().length(2).refine((c) => !!getCountry(c)),
  city: z.string().trim().max(100).optional().default(""),
  browserTimezone: z.string().max(64).optional(),
  language: z.string().max(5).optional(),
});

export async function createBusiness(input: z.input<typeof businessSchema>): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = businessSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const user = await getUser();
  if (!user) return fail("errors.unauthorized");
  const supabase = await getSupabase();

  const { data: existing } = await supabase.from("business_members").select("business_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (existing) return fail("errors.business_exists");

  const inferred = inferBusinessSettings(parsed.data.country, { browserTimezone: parsed.data.browserTimezone, language: parsed.data.language });
  const baseSlug = slugify(parsed.data.name);

  let business: Business | null = null;
  for (let attempt = 0; attempt < 6 && !business; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 50)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.rpc("create_business", {
      p_name: parsed.data.name,
      p_slug: slug,
      p_business_type: parsed.data.business_type,
      p_country: inferred.country,
      p_city: parsed.data.city || null,
      p_currency: inferred.currency,
      p_timezone: inferred.timezone,
      p_locale: inferred.locale,
      p_language: inferred.language,
      p_week_start: inferred.weekStart,
    });
    if (error && error.code !== "23505") return fail(error.message);
    business = (data as Business) ?? null;
  }
  if (!business) return fail("errors.generic");

  // The owner is the first professional ("I work alone" by default).
  const profile = await getProfile();
  await supabase.from("staff").insert({
    business_id: business.id,
    user_id: user.id,
    name: profile?.name || user.email?.split("@")[0] || "Owner",
    email: user.email,
    color: STAFF_COLORS[0],
  });
  return ok({ id: business.id, slug: business.slug });
}

const servicesSchema = z.array(
  z.object({
    name: z.string().trim().min(1).max(100),
    duration_minutes: z.coerce.number().int().min(5).max(1440),
    price: z.coerce.number().min(0).max(10_000_000),
  }),
).max(50);

export async function saveOnboardingServices(input: z.input<typeof servicesSchema>): Promise<ActionResult> {
  const parsed = servicesSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const { business, supabase } = await requireBusiness({ allowIncompleteOnboarding: true });
  if (!parsed.data.length) return ok(undefined);

  const { data: services, error } = await supabase
    .from("services")
    .insert(parsed.data.map((s, i) => ({ ...s, business_id: business.id, currency: business.currency, sort_order: i })))
    .select("id");
  if (error) return fail(error.message);

  const { data: staff } = await supabase.from("staff").select("id").eq("business_id", business.id);
  const links = (staff ?? []).flatMap((st) => (services ?? []).map((sv) => ({ business_id: business.id, staff_id: st.id, service_id: sv.id })));
  if (links.length) await supabase.from("staff_services").upsert(links, { ignoreDuplicates: true });
  return ok(undefined);
}

const hoursSchema = z.array(
  z.object({
    day: z.number().int().min(1).max(7),
    open: z.boolean(),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
).length(7);

export type WeeklyHours = z.infer<typeof hoursSchema>;

/** Replace weekly hours for the given staff (or all staff). */
export async function saveWeeklyHours(input: WeeklyHours, staffId?: string): Promise<ActionResult> {
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success || parsed.data.some((d) => d.open && d.end <= d.start)) return fail("errors.invalid_hours");
  const { business, supabase, user } = await requireBusiness({ allowIncompleteOnboarding: true });

  let staffQuery = supabase.from("staff").select("id").eq("business_id", business.id);
  if (staffId) staffQuery = staffQuery.eq("id", staffId);
  const { data: staff } = await staffQuery;
  const ids = (staff ?? []).map((s) => s.id);
  if (!ids.length) return fail("errors.not_found");

  const { error: delError } = await supabase.from("availability_rules").delete().eq("business_id", business.id).in("staff_id", ids);
  if (delError) return fail(delError.message);
  const rows = ids.flatMap((id) =>
    parsed.data.filter((d) => d.open).map((d) => ({ business_id: business.id, staff_id: id, day_of_week: d.day, start_time: d.start, end_time: d.end })),
  );
  if (rows.length) {
    const { error } = await supabase.from("availability_rules").insert(rows);
    if (error) return fail(error.message);
  }
  await audit(supabase, { business_id: business.id, actor_id: user.id, action: "update", entity: "availability", data: { staff: ids } });
  revalidatePath("/staff");
  return ok(undefined);
}

const staffSchema = z.object({
  solo: z.boolean(),
  ownerPerformsServices: z.boolean().default(true),
  members: z.array(z.object({ name: z.string().trim().min(1).max(100) })).max(30),
});

export async function saveOnboardingStaff(input: z.input<typeof staffSchema>): Promise<ActionResult> {
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) return fail("errors.invalid");
  const { business, supabase, user } = await requireBusiness({ allowIncompleteOnboarding: true });
  const { solo, members, ownerPerformsServices } = parsed.data;

  await supabase.from("businesses").update({ solo_mode: solo || members.length === 0 }).eq("id", business.id);
  if (solo || !members.length) return ok(undefined);

  const { data: owner } = await supabase.from("staff").select("id").eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
  const { count } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", business.id);
  const { data: created, error } = await supabase
    .from("staff")
    .insert(members.map((m, i) => ({ business_id: business.id, name: m.name, color: STAFF_COLORS[((count ?? 1) + i) % STAFF_COLORS.length], sort_order: (count ?? 1) + i })))
    .select("id");
  if (error) return fail(error.message);

  // New professionals inherit the business hours and all services.
  const [{ data: rules }, { data: services }] = await Promise.all([
    owner ? supabase.from("availability_rules").select("day_of_week, start_time, end_time").eq("staff_id", owner.id) : Promise.resolve({ data: [] as { day_of_week: number; start_time: string; end_time: string }[] }),
    supabase.from("services").select("id").eq("business_id", business.id),
  ]);
  const newIds = (created ?? []).map((c) => c.id);
  const ruleRows = newIds.flatMap((id) => (rules ?? []).map((r) => ({ ...r, business_id: business.id, staff_id: id })));
  const linkRows = newIds.flatMap((id) => (services ?? []).map((s) => ({ business_id: business.id, staff_id: id, service_id: s.id })));
  if (ruleRows.length) await supabase.from("availability_rules").insert(ruleRows);
  if (linkRows.length) await supabase.from("staff_services").insert(linkRows);

  if (owner && !ownerPerformsServices) await supabase.from("staff").update({ active: false }).eq("id", owner.id);
  return ok(undefined);
}

export async function completeOnboarding(): Promise<ActionResult> {
  const { business, supabase } = await requireBusiness({ allowIncompleteOnboarding: true });
  const { error } = await supabase.from("businesses").update({ onboarding_completed: true }).eq("id", business.id);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return ok(undefined);
}
