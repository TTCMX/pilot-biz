"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";
import { useI18n } from "@/components/I18nProvider";
import type { MessageKey } from "@/lib/i18n";
import { Logo } from "@/components/Icon";

export function AuthForm({ mode, next, linkError }: { mode: "login" | "signup"; next?: string; linkError?: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const msg = (k?: string) => (k ? (k.includes(".") ? t(k as MessageKey) : k) : null);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="card px-6 py-9 sm:px-10">
        <Link href="/" className="mb-6 inline-block"><Logo /></Link>
        <h1 className="text-[28px] font-normal leading-tight text-stone-900">{mode === "login" ? t("auth.login_title") : t("auth.signup_title")}</h1>
        <p className="mb-7 mt-2 text-stone-600">{mode === "login" ? t("auth.login_subtitle") : t("auth.signup_subtitle")}</p>
        {linkError && !state && <p className="mb-4 rounded-2xl bg-warn-100 p-3 text-sm text-warn-700">{t("auth.link_expired")}</p>}
        {state?.info ? (
          <p className="rounded-2xl bg-ok-100 p-3 text-sm text-ok-700">{msg(state.info)}</p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="next" value={next ?? ""} />
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="name">{t("auth.name")}</label>
                <input className="input" id="name" name="name" autoComplete="name" defaultValue={state?.name} required />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">{t("auth.email")}</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={state?.email} required />
            </div>
            <div>
              <label className="label" htmlFor="password">{t("auth.password")}</label>
              <input className="input" id="password" name="password" type="password" minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
              {mode === "signup" && <p className="mt-1 text-xs text-stone-500">{t("auth.password_hint")}</p>}
              {mode === "login" && (
                <Link href="/forgot-password" className="mt-1.5 inline-block text-xs font-medium text-brand-600">{t("auth.forgot_link")}</Link>
              )}
            </div>
            {state?.error && <p className="text-sm text-bad-700">{msg(state.error)}</p>}
            <button className="btn-primary w-full" disabled={pending}>
              {pending ? t("common.loading") : mode === "login" ? t("auth.login") : t("auth.create_account")}
            </button>
          </form>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-stone-600">
        {mode === "login" ? (
          <>{t("auth.no_account")} <Link className="font-medium text-brand-600" href="/signup">{t("auth.create_account")}</Link></>
        ) : (
          <>{t("auth.have_account")} <Link className="font-medium text-brand-600" href="/login">{t("auth.login")}</Link></>
        )}
      </p>
    </div>
  );
}
