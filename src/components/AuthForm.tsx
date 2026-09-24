"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";
import { useI18n } from "@/components/I18nProvider";
import type { MessageKey } from "@/lib/i18n";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const msg = (k?: string) => (k ? (k.includes(".") ? t(k as MessageKey) : k) : null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 text-center text-2xl font-bold text-brand-600">Pilot</Link>
      <div className="card">
        <h1 className="h2 mb-1">{mode === "login" ? t("auth.login_title") : t("auth.signup_title")}</h1>
        <p className="muted mb-5">{mode === "login" ? t("auth.login_subtitle") : t("auth.signup_subtitle")}</p>
        {state?.info ? (
          <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{msg(state.info)}</p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="next" value={next ?? ""} />
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="name">{t("auth.name")}</label>
                <input className="input" id="name" name="name" autoComplete="name" required />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">{t("auth.email")}</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <label className="label" htmlFor="password">{t("auth.password")}</label>
              <input className="input" id="password" name="password" type="password" minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
              {mode === "signup" && <p className="mt-1 text-xs text-stone-500">{t("auth.password_hint")}</p>}
            </div>
            {state?.error && <p className="text-sm text-red-600">{msg(state.error)}</p>}
            <button className="btn-primary w-full" disabled={pending}>
              {pending ? t("common.loading") : mode === "login" ? t("auth.login") : t("auth.create_account")}
            </button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-stone-600">
        {mode === "login" ? (
          <>{t("auth.no_account")} <Link className="font-semibold text-brand-600" href="/signup">{t("auth.create_account")}</Link></>
        ) : (
          <>{t("auth.have_account")} <Link className="font-semibold text-brand-600" href="/login">{t("auth.login")}</Link></>
        )}
      </p>
    </div>
  );
}
