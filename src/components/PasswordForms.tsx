"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type AuthState } from "@/app/auth/actions";
import { useI18n } from "@/components/I18nProvider";
import type { MessageKey } from "@/lib/i18n";
import { Logo } from "@/components/Icon";

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="card px-6 py-9 sm:px-10">
        <Link href="/" className="mb-6 inline-block"><Logo /></Link>
        <h1 className="text-[28px] font-normal leading-tight text-stone-900">{title}</h1>
        <p className="mb-7 mt-2 text-stone-600">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  return (
    <Shell title={t("auth.forgot_title")} subtitle={t("auth.forgot_subtitle")}>
      {state?.info ? (
        <p className="rounded-2xl bg-ok-100 p-3 text-sm text-ok-700">{t(state.info as MessageKey)}</p>
      ) : (
        <form action={action} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{t("auth.email")}</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" defaultValue={state?.email} required autoFocus />
          </div>
          {state?.error && <p className="text-sm text-bad-700">{t(state.error as MessageKey)}</p>}
          <button className="btn-primary w-full" disabled={pending}>{pending ? t("common.loading") : t("auth.send_reset")}</button>
        </form>
      )}
      <p className="mt-5 text-center text-sm">
        <Link className="btn-ghost" href="/login">{t("auth.login")}</Link>
      </p>
    </Shell>
  );
}

export function ResetPasswordForm({ hasSession }: { hasSession: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, undefined);
  const msg = (k: string) => (k.includes(".") ? t(k as MessageKey) : k);
  return (
    <Shell title={t("auth.reset_title")} subtitle={t("auth.reset_subtitle")}>
      {!hasSession ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-warn-100 p-3 text-sm text-warn-700">{t("auth.reset_link_invalid")}</p>
          <Link className="btn-primary w-full" href="/forgot-password">{t("auth.send_reset")}</Link>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">{t("auth.new_password")}</label>
            <input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required autoFocus />
            <p className="mt-1 text-xs text-stone-500">{t("auth.password_hint")}</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">{t("auth.confirm_password")}</label>
            <input className="input" id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          {state?.error && <p className="text-sm text-bad-700">{msg(state.error)}</p>}
          <button className="btn-primary w-full" disabled={pending}>{pending ? t("common.saving") : t("auth.save_password")}</button>
        </form>
      )}
    </Shell>
  );
}
