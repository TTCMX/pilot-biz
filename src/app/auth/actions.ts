"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type AuthState = { error?: string; info?: string } | undefined;

const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(100), email: z.email(), password: z.string().min(8).max(72) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "auth.invalid_signup" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name }, emailRedirectTo: `${env.appUrl()}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message };
  if (!data.session) return { info: "auth.check_email" };
  redirect("/onboarding");
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "auth.invalid_login" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "auth.invalid_login" };
  redirect(safeNext(form.get("next")));
}
