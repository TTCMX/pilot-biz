"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { WeeklyHoursEditor, DEFAULT_HOURS } from "@/components/WeeklyHoursEditor";
import { CsvImport } from "@/components/CsvImport";
import { COUNTRIES } from "@/lib/i18n/countries";
import { BUSINESS_TYPES, serviceTemplates } from "@/lib/templates";
import type { MessageKey } from "@/lib/i18n";
import {
  completeOnboarding,
  createBusiness,
  saveOnboardingServices,
  saveOnboardingStaff,
  saveWeeklyHours,
  type WeeklyHours,
} from "@/app/actions/onboarding";

type Props = {
  business: { id: string; slug: string; business_type: string; currency: string; week_start: number } | null;
  ownerName: string;
  appUrl: string;
  language: string;
};

const STEPS = ["business", "services", "hours", "staff", "customers", "ready"] as const;

export function OnboardingWizard({ business, ownerName, appUrl, language }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState(business ? 1 : 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string } | undefined>, next: number) {
    setPending(true);
    setError(null);
    const res = await fn();
    setPending(false);
    if (res && !res.ok) return setError(t(res.error as MessageKey));
    setStep(next);
    router.refresh();
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-xl font-bold text-brand-600">Pilot</span>
        <span className="text-xs font-medium text-stone-500">{t("onboarding.step", { current: step + 1, total: STEPS.length })}</span>
      </div>
      <div className="mb-6 flex gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-500" : "bg-stone-200"}`} />
        ))}
      </div>

      {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {step === 0 && <BusinessStep pending={pending} language={language} onSubmit={(v) => run(() => createBusiness(v), 1)} />}
      {step === 1 && business && (
        <ServicesStep
          pending={pending}
          businessType={business.business_type}
          currency={business.currency}
          onSubmit={(v) => run(() => saveOnboardingServices(v), 2)}
          onSkip={() => setStep(2)}
        />
      )}
      {step === 2 && business && <HoursStep pending={pending} weekStart={business.week_start} onSubmit={(v) => run(() => saveWeeklyHours(v), 3)} />}
      {step === 3 && <StaffStep pending={pending} ownerName={ownerName} onSubmit={(v) => run(() => saveOnboardingStaff(v), 4)} />}
      {step === 4 && <CustomersStep onNext={() => setStep(5)} />}
      {step === 5 && business && (
        <ReadyStep
          url={`${appUrl}/${business.slug}`}
          pending={pending}
          onFinish={() =>
            run(async () => {
              const r = await completeOnboarding();
              if (r.ok) router.push("/dashboard");
              return r;
            }, 5)
          }
        />
      )}
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="h1">{title}</h1>
      {subtitle && <p className="mt-1 text-stone-600">{subtitle}</p>}
    </div>
  );
}

function BusinessStep({ pending, language, onSubmit }: { pending: boolean; language: string; onSubmit: (v: Parameters<typeof createBusiness>[0]) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof BUSINESS_TYPES)[number]>("nails");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [tz, setTz] = useState<string | undefined>();

  useEffect(() => {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTz(browserTz);
    const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
    const guess = COUNTRIES.find((c) => c.timezones.includes(browserTz))?.code ?? COUNTRIES.find((c) => c.code === region)?.code;
    if (guess) setCountry(guess);
  }, []);

  const countryNames = useMemo(() => {
    const dn = new Intl.DisplayNames([language], { type: "region" });
    return COUNTRIES.map((c) => ({ code: c.code, name: dn.of(c.code) ?? c.code })).sort((a, b) => a.name.localeCompare(b.name, language));
  }, [language]);

  return (
    <form
      className="card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, business_type: type, country, city, browserTimezone: tz, language });
      }}
    >
      <StepHeader title={t("onboarding.business_title")} subtitle={t("onboarding.business_subtitle")} />
      <div>
        <label className="label">{t("business.name")}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder={t("onboarding.business_name_placeholder")} autoFocus />
      </div>
      <div>
        <label className="label">{t("business.type")}</label>
        <div className="grid grid-cols-3 gap-2">
          {BUSINESS_TYPES.map((bt) => (
            <button
              type="button"
              key={bt}
              onClick={() => setType(bt)}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${type === bt ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-200 bg-white"}`}
            >
              {t(`business_type.${bt}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{t("business.country")}</label>
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)} required>
            <option value="">—</option>
            {countryNames.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t("business.city")}</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
        </div>
      </div>
      <p className="text-xs text-stone-500">{t("onboarding.inferred_hint")}</p>
      <button className="btn-primary w-full" disabled={pending || !name || !country}>{pending ? t("common.loading") : t("common.continue")}</button>
    </form>
  );
}

function ServicesStep({ pending, businessType, currency, onSubmit, onSkip }: {
  pending: boolean; businessType: string; currency: string;
  onSubmit: (v: { name: string; duration_minutes: number; price: number }[]) => void; onSkip: () => void;
}) {
  const { t, money } = useI18n();
  const [items, setItems] = useState(() =>
    serviceTemplates(businessType, currency).map((s) => ({ name: t(s.nameKey), duration_minutes: s.duration_minutes, price: s.price, on: true })),
  );
  const update = (i: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <div className="card space-y-4">
      <StepHeader title={t("onboarding.services_title")} subtitle={t("onboarding.services_subtitle")} />
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className={`rounded-xl border p-3 ${it.on ? "border-stone-200" : "border-dashed border-stone-200 opacity-60"}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-brand-600" checked={it.on} onChange={(e) => update(i, { on: e.target.checked })} />
              <input className="input flex-1" value={it.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={t("service.name")} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
              <label className="text-xs text-stone-500">
                {t("service.duration_minutes")}
                <input className="input mt-1" type="number" min={5} step={5} value={it.duration_minutes} onChange={(e) => update(i, { duration_minutes: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-stone-500">
                {t("service.price")} ({currency})
                <input className="input mt-1" type="number" min={0} step="any" value={it.price} onChange={(e) => update(i, { price: Number(e.target.value) })} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost w-full" onClick={() => setItems([...items, { name: "", duration_minutes: 60, price: 0, on: true }])}>
        + {t("service.add")}
      </button>
      <p className="text-xs text-stone-500">{t("onboarding.services_example", { price: money(items[0]?.price ?? 0, currency) })}</p>
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={onSkip}>{t("common.skip")}</button>
        <button
          className="btn-primary flex-1"
          disabled={pending}
          onClick={() => onSubmit(items.filter((i) => i.on && i.name.trim()).map(({ name, duration_minutes, price }) => ({ name, duration_minutes, price })))}
        >
          {pending ? t("common.loading") : t("common.continue")}
        </button>
      </div>
    </div>
  );
}

function HoursStep({ pending, weekStart, onSubmit }: { pending: boolean; weekStart: number; onSubmit: (v: WeeklyHours) => void }) {
  const { t } = useI18n();
  const [hours, setHours] = useState<WeeklyHours>(DEFAULT_HOURS);
  return (
    <div className="card space-y-4">
      <StepHeader title={t("onboarding.hours_title")} subtitle={t("onboarding.hours_subtitle")} />
      <WeeklyHoursEditor value={hours} onChange={setHours} weekStart={weekStart} />
      <button className="btn-primary w-full" disabled={pending} onClick={() => onSubmit(hours)}>
        {pending ? t("common.loading") : t("common.continue")}
      </button>
    </div>
  );
}

function StaffStep({ pending, ownerName, onSubmit }: { pending: boolean; ownerName: string; onSubmit: (v: Parameters<typeof saveOnboardingStaff>[0]) => void }) {
  const { t } = useI18n();
  const [team, setTeam] = useState(false);
  const [members, setMembers] = useState<string[]>([""]);
  const [ownerPerforms, setOwnerPerforms] = useState(true);

  return (
    <div className="card space-y-4">
      <StepHeader title={t("onboarding.staff_title")} subtitle={t("onboarding.staff_subtitle")} />
      <div className="grid grid-cols-2 gap-2">
        <button className={`rounded-xl border p-4 text-left ${!team ? "border-brand-500 bg-brand-50" : "border-stone-200"}`} onClick={() => setTeam(false)}>
          <div className="text-2xl">🙋‍♀️</div>
          <div className="mt-1 font-semibold">{t("onboarding.work_alone")}</div>
        </button>
        <button className={`rounded-xl border p-4 text-left ${team ? "border-brand-500 bg-brand-50" : "border-stone-200"}`} onClick={() => setTeam(true)}>
          <div className="text-2xl">👩‍👩‍👧</div>
          <div className="mt-1 font-semibold">{t("onboarding.have_team")}</div>
        </button>
      </div>
      {team && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand-600" checked={ownerPerforms} onChange={(e) => setOwnerPerforms(e.target.checked)} />
            {t("onboarding.owner_performs", { name: ownerName })}
          </label>
          {members.map((m, i) => (
            <input key={i} className="input" placeholder={t("staff.name")} value={m} onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <button className="btn-ghost w-full" onClick={() => setMembers([...members, ""])}>+ {t("staff.add")}</button>
          <p className="text-xs text-stone-500">{t("onboarding.staff_hint")}</p>
        </div>
      )}
      <button
        className="btn-primary w-full"
        disabled={pending}
        onClick={() => onSubmit({ solo: !team, ownerPerformsServices: ownerPerforms, members: members.filter((m) => m.trim()).map((name) => ({ name })) })}
      >
        {pending ? t("common.loading") : t("common.continue")}
      </button>
    </div>
  );
}

function CustomersStep({ onNext }: { onNext: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"choose" | "import">("choose");
  return (
    <div className="card space-y-4">
      <StepHeader title={t("onboarding.customers_title")} subtitle={t("onboarding.customers_subtitle")} />
      {mode === "choose" ? (
        <div className="space-y-2">
          <button className="btn-secondary w-full justify-start" onClick={() => setMode("import")}>📄 {t("onboarding.import_csv")}</button>
          <button className="btn-secondary w-full justify-start" onClick={onNext}>✨ {t("onboarding.start_from_zero")}</button>
          <button className="btn-ghost w-full" onClick={onNext}>{t("common.skip")}</button>
        </div>
      ) : (
        <>
          <CsvImport onDone={() => setTimeout(onNext, 1200)} />
          <button className="btn-ghost w-full" onClick={onNext}>{t("common.skip")}</button>
        </>
      )}
    </div>
  );
}

function ReadyStep({ url, pending, onFinish }: { url: string; pending: boolean; onFinish: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div className="card">
        <StepHeader title={`🎉 ${t("onboarding.ready_title")}`} subtitle={t("onboarding.ready_subtitle")} />
        <div className="flex items-center gap-2 rounded-xl bg-stone-100 p-3">
          <span className="flex-1 truncate font-mono text-sm">{url}</span>
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? t("common.copied") : t("booking_page.copy_link")}
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <a className="btn-primary" href={`${url}?test=1`} target="_blank" rel="noreferrer">🧪 {t("booking_page.test_booking")}</a>
          <a className="btn-secondary" href={url} target="_blank" rel="noreferrer">{t("booking_page.view")}</a>
        </div>
        <p className="mt-3 text-xs text-stone-500">{t("onboarding.test_hint")}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-2 text-xs font-medium text-stone-500">{t("booking_page.preview")}</div>
        <iframe src={url} className="h-[520px] w-full" title="preview" />
      </div>
      <button className="btn-primary w-full" disabled={pending} onClick={onFinish}>{t("onboarding.go_dashboard")}</button>
    </div>
  );
}
