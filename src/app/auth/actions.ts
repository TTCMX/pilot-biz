"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// email/name are echoed back so the form keeps them after a failed attempt.
export type AuthState = { error?: string; info?: string; email?: string; name?: string } | undefined;

const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(100), email: z.email(), password: z.string().min(8).max(72) })
    .safeParse(Object.fromEntries(form));
  const echo = { email: String(form.get("email") ?? ""), name: String(form.get("name") ?? "") };
  if (!parsed.success) return { error: "auth.invalid_signup", ...echo };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { name: parsed.data.name }, emailRedirectTo: `${env.appUrl()}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message, ...echo };
  if (!data.session) return { info: "auth.check_email" };
  redirect("/onboarding");
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  const echo = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { error: "auth.invalid_login", ...echo };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "auth.invalid_login", ...echo };
  redirect(safeNext(form.get("next")));
}

/** Sends the password reset email. Always answers the same way to avoid revealing which emails exist. */
export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.email() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "auth.invalid_email", email: String(form.get("email") ?? "") };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.appUrl()}/auth/callback?next=/reset-password`,
  });
  return { info: "auth.reset_sent" };
}

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({ password: z.string().min(8).max(72), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"] })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "auth.passwords_invalid" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "auth.reset_link_invalid" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
