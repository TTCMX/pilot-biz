import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isLanguage, type Language } from "@/lib/i18n/countries";
import type { Business } from "@/lib/types";

export const getSupabase = cache(createClient);

export const getUser = cache(async () => {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export const getProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await getSupabase();
  const { data } = await supabase.from("profiles").select("id, name, email, phone").eq("id", user.id).maybeSingle();
  return data ?? { id: user.id, name: (user.user_metadata?.name as string) ?? user.email?.split("@")[0] ?? "", email: user.email ?? null, phone: null };
});

/** The business of the signed-in user (first membership; multi-business can be added later). */
export const getBusiness = cache(async (): Promise<Business | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("business_members")
    .select("business:businesses(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return ((data?.business as unknown) as Business) ?? null;
});

/** Guard for owner pages: signed in + business exists. */
export async function requireBusiness(opts: { allowIncompleteOnboarding?: boolean } = {}) {
  const user = await getUser();
  if (!user) redirect("/login");
  const business = await getBusiness();
  if (!business) redirect("/onboarding");
  if (!opts.allowIncompleteOnboarding && !business.onboarding_completed) redirect("/onboarding");
  const supabase = await getSupabase();
  return { user, business, supabase };
}

/** Language for pages without a business (landing, auth, first onboarding step). */
export async function getRequestLanguage(): Promise<Language> {
  const cookie = (await cookies()).get("lang")?.value;
  if (isLanguage(cookie)) return cookie;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLanguage(code)) return code;
  }
  return "en";
}
