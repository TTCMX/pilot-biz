"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { updateBusiness, uploadLogo } from "@/app/actions/settings";
import { COUNTRIES, SUPPORTED_LANGUAGES, getCountry } from "@/lib/i18n/countries";
import { BUSINESS_TYPES } from "@/lib/templates";
import { weekdayName } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n";
import type { Business } from "@/lib/types";
import { Icon } from "@/components/Icon";

export function SettingsView({ business, bookingUrl, appUrl }: { business: Business; bookingUrl: string; appUrl: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [country, setCountry] = useState(business.country);
  const [copied, setCopied] = useState(false);

  const regionNames = useMemo(() => new Intl.DisplayNames([locale], { type: "region" }), [locale]);
  const langNames = useMemo(() => new Intl.DisplayNames([locale], { type: "language" }), [locale]);
  const tzOptions = useMemo(() => {
    const own = getCountry(country)?.timezones ?? [];
    return Array.from(new Set([...own, business.timezone]));
  }, [country, business.timezone]);
  const currencies = Array.from(new Set([...COUNTRIES.map((c) => c.currency), business.currency])).sort();

  const done = (r: { ok: boolean; error?: string }) => {
    setMessage(r.ok ? { ok: true, text: t("common.saved") } : { ok: false, text: t(r.error as MessageKey) });
    if (r.ok) router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="h1">{t("nav.settings")}</h1>

      <div className="grid grid-cols-2 gap-2 md:hidden">
        <Link href="/services" className="btn-tonal"><Icon name="cut" size={18} />{t("nav.services")}</Link>
        <Link href="/staff" className="btn-tonal"><Icon name="team" size={18} />{t("nav.staff")}</Link>
      </div>

      <section className="card space-y-3">
        <h2 className="h2">{t("settings.booking_page")}</h2>
        <div className="flex items-center gap-2 rounded-2xl bg-stone-100 py-2 pl-4 pr-2">
          <Icon name="link" size={20} className="text-stone-500" />
          <span className="flex-1 truncate font-mono text-sm">{bookingUrl}</span>
          <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(bookingUrl); setCopied(true); }}><Icon name="copy" size={16} />{copied ? t("common.copied") : t("booking_page.copy_link")}</button>
          <a className="btn-secondary btn-sm" href={bookingUrl} target="_blank" rel="noreferrer" aria-label="open"><Icon name="openInNew" size={16} /></a>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="h2">{t("settings.logo")}</h2>
        <div className="flex items-center gap-4">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt="" className="size-16 rounded-2xl border border-stone-200 object-cover" />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-2xl bg-brand-100 text-2xl font-medium text-brand-700">{business.name[0]}</div>
          )}
          <form action={(f) => start(async () => done(await uploadLogo(f)))} className="flex flex-1 flex-wrap items-center gap-2">
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-sm" required />
            <button className="btn-secondary btn-sm" disabled={pending}>{t("settings.upload")}</button>
          </form>
        </div>
      </section>

      <form
        className="card space-y-4"
        action={(f) =>
          start(async () =>
            done(
              await updateBusiness({
                name: String(f.get("name")),
                slug: String(f.get("slug")),
                business_type: String(f.get("business_type")) as (typeof BUSINESS_TYPES)[number],
                country: String(f.get("country")),
                city: String(f.get("city") ?? ""),
                address: String(f.get("address") ?? ""),
                phone: String(f.get("phone") ?? ""),
                currency: String(f.get("currency")),
                timezone: String(f.get("timezone")),
                language: String(f.get("language")),
                week_start: Number(f.get("week_start")),
                slot_interval_minutes: Number(f.get("slot_interval_minutes")),
                min_notice_minutes: Number(f.get("min_notice_minutes")),
                max_advance_days: Number(f.get("max_advance_days")),
              }),
            ),
          )
        }
      >
        <h2 className="h2">{t("settings.business")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("business.name")}><input className="input" name="name" defaultValue={business.name} required /></Field>
          <Field label={t("business.type")}>
            <select className="input" name="business_type" defaultValue={business.business_type}>
              {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{t(`business_type.${b}` as MessageKey)}</option>)}
            </select>
          </Field>
          <Field label={t("settings.slug")} hint={`${appUrl}/…`}><input className="input" name="slug" defaultValue={business.slug} pattern="[a-z0-9][a-z0-9-]{1,58}[a-z0-9]" required /></Field>
          <Field label={t("business.phone")}><input className="input" name="phone" type="tel" defaultValue={business.phone ?? ""} /></Field>
          <Field label={t("business.country")}>
            <select className="input" name="country" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{regionNames.of(c.code)}</option>)}
            </select>
          </Field>
          <Field label={t("business.city")}><input className="input" name="city" defaultValue={business.city ?? ""} /></Field>
          <div className="sm:col-span-2">
            <Field label={t("business.address")}><input className="input" name="address" defaultValue={business.address ?? ""} /></Field>
          </div>
        </div>

        <h2 className="h2 pt-2">{t("settings.regional")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("settings.timezone")}>
            <select className="input" name="timezone" defaultValue={business.timezone} key={country}>
              {tzOptions.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label={t("settings.currency")}>
            <select className="input" name="currency" defaultValue={business.currency}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label={t("settings.language")}>
            <select className="input" name="language" defaultValue={business.language}>
              {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{langNames.of(l)}</option>)}
            </select>
          </Field>
          <Field label={t("settings.week_start")}>
            <select className="input" name="week_start" defaultValue={business.week_start}>
              {[1, 6, 7].map((d) => <option key={d} value={d}>{weekdayName(d, locale)}</option>)}
            </select>
          </Field>
        </div>

        <h2 className="h2 pt-2">{t("settings.booking_rules")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("settings.slot_interval")}>
            <select className="input" name="slot_interval_minutes" defaultValue={business.slot_interval_minutes}>
              {[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </Field>
          <Field label={t("settings.min_notice")}>
            <select className="input" name="min_notice_minutes" defaultValue={business.min_notice_minutes}>
              {[0, 30, 60, 120, 240, 720, 1440, 2880].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
          </Field>
          <Field label={t("settings.max_advance")}>
            <input className="input" type="number" name="max_advance_days" min={1} max={365} defaultValue={business.max_advance_days} />
          </Field>
        </div>

        {message && <p className={`text-sm ${message.ok ? "text-ok-700" : "text-bad-700"}`}>{message.text}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</button>
      </form>

      <form action="/auth/signout" method="post" className="md:hidden">
        <button className="btn-ghost w-full">{t("nav.sign_out")}</button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 truncate text-xs text-stone-400">{hint}</p>}
    </div>
  );
}
