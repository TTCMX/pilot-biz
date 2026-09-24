"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { WeeklyHoursEditor, DEFAULT_HOURS } from "@/components/WeeklyHoursEditor";
import { CsvImport } from "@/components/CsvImport";
import { COUNTRIES } from "@/lib/i18n/countries";
import { BUSINESS_TYPES, serviceTemplates } from "@/lib/templates";
import type { MessageKey } from "@/lib/i18n";
import { Icon, Logo, type IconName } from "@/components/Icon";
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
        <Logo />
        <span className="text-xs font-medium text-stone-500">{t("onboarding.step", { current: step + 1, total: STEPS.length })}</span>
      </div>
      <div className="mb-6 flex gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-brand-600" : "bg-stone-200"}`} />
        ))}
      </div>

      {error && <p className="mb-4 rounded-2xl bg-bad-100 p-4 text-sm text-bad-700">{error}</p>}

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
      {subtitle && <p className="mt-2 text-stone-600">{subtitle}</p>}
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
              className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors ${type === bt ? "border-transparent bg-nav text-nav-on" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"}`}
            >
              {type === bt && <Icon name="check" size={16} />}
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
          <div key={i} className={`rounded-2xl p-4 transition-colors ${it.on ? "bg-stone-100" : "bg-stone-50 opacity-60"}`}>
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
      <button type="button" className="btn-ghost" onClick={() => setItems([...items, { name: "", duration_minutes: 60, price: 0, on: true }])}>
        <Icon name="add" size={18} />
        {t("service.add")}
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
        <ChoiceCard active={!team} icon="person" label={t("onboarding.work_alone")} onClick={() => setTeam(false)} />
        <ChoiceCard active={team} icon="group" label={t("onboarding.have_team")} onClick={() => setTeam(true)} />
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
          <button className="btn-ghost" onClick={() => setMembers([...members, ""])}><Icon name="add" size={18} />{t("staff.add")}</button>
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
          <ChoiceRow icon="upload" label={t("onboarding.import_csv")} onClick={() => setMode("import")} />
          <ChoiceRow icon="sparkle" label={t("onboarding.start_from_zero")} onClick={onNext} />
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
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-ok-100 text-ok-700"><Icon name="check" size={30} /></span>
        <StepHeader title={t("onboarding.ready_title")} subtitle={t("onboarding.ready_subtitle")} />
        <div className="flex items-center gap-2 rounded-2xl bg-stone-100 py-2 pl-4 pr-2">
          <Icon name="link" size={20} className="text-stone-500" />
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
          <a className="btn-primary" href={`${url}?test=1`} target="_blank" rel="noreferrer"><Icon name="science" size={18} />{t("booking_page.test_booking")}</a>
          <a className="btn-secondary" href={url} target="_blank" rel="noreferrer"><Icon name="openInNew" size={18} />{t("booking_page.view")}</a>
        </div>
        <p className="mt-3 text-xs text-stone-500">{t("onboarding.test_hint")}</p>
      </div>
      <div className="overflow-hidden rounded-3xl bg-white shadow-card">
        <div className="border-b border-stone-100 px-5 py-3 text-xs font-medium text-stone-500">{t("booking_page.preview")}</div>
        <iframe src={url} className="h-[520px] w-full" title="preview" />
      </div>
      <button className="btn-primary w-full" disabled={pending} onClick={onFinish}>{t("onboarding.go_dashboard")}</button>
    </div>
  );
}

function ChoiceCard({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${active ? "border-transparent bg-nav text-nav-on" : "border-stone-300 bg-white hover:bg-stone-50"}`}
    >
      <span className={`flex size-10 items-center justify-center rounded-full ${active ? "bg-white/70" : "bg-stone-100 text-stone-600"}`}>
        <Icon name={icon} size={22} />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function ChoiceRow({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl bg-stone-100 p-4 text-left font-medium text-stone-800 transition-colors hover:bg-stone-200">
      <span className="flex size-10 items-center justify-center rounded-full bg-white text-brand-600"><Icon name={icon} size={22} /></span>
      <span className="flex-1">{label}</span>
      <Icon name="chevronRight" size={22} className="text-stone-400" />
    </button>
  );
}
