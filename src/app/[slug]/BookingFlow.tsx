"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { useI18n } from "@/components/I18nProvider";
import { createPublicBooking, joinPublicWaitlist } from "@/app/actions/public";
import type { PublicCatalog } from "@/lib/booking/public";
import type { MessageKey } from "@/lib/i18n";

type Step = "service" | "staff" | "time" | "details";
type DaySlots = { date: string; slots: { start: string; end: string }[] };

export function BookingFlow({ slug, catalog, initialServiceId, initialStaffId, rebookToken, isTest }: {
  slug: string;
  catalog: PublicCatalog;
  initialServiceId: string | null;
  initialStaffId: string | null;
  rebookToken: string | null;
  isTest: boolean;
}) {
  const { t, money, duration } = useI18n();
  const router = useRouter();
  const { services, staff, links } = catalog;

  const eligibleFor = (serviceId: string) => {
    const assigned = links.filter((l) => l.service_id === serviceId).map((l) => l.staff_id);
    return staff.filter((s) => !assigned.length || assigned.includes(s.id));
  };

  const validService = services.find((s) => s.id === initialServiceId)?.id ?? null;
  const [serviceId, setServiceId] = useState<string | null>(validService);
  const [staffId, setStaffId] = useState<string | null>(validService && eligibleFor(validService).some((s) => s.id === initialStaffId) ? initialStaffId : null);
  const [step, setStep] = useState<Step>(validService ? (eligibleFor(validService).length > 1 && !initialStaffId ? "staff" : "time") : "service");
  const [slot, setSlot] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const eligible = serviceId ? eligibleFor(serviceId) : [];

  function chooseService(id: string) {
    setServiceId(id);
    setSlot(null);
    const e = eligibleFor(id);
    if (e.length > 1) setStep("staff");
    else {
      setStaffId(e[0]?.id ?? null);
      setStep("time");
    }
  }

  const back = () => {
    if (step === "details") setStep("time");
    else if (step === "time") setStep(eligible.length > 1 ? "staff" : "service");
    else if (step === "staff") setStep("service");
  };

  if (!services.length) return <p className="p-6 text-center text-stone-500">{t("booking.no_services")}</p>;

  return (
    <div className="px-4 pb-10 pt-4">
      {isTest && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">🧪 {t("booking.test_banner")}</p>}
      {step !== "service" && (
        <button className="mb-3 text-sm font-medium text-stone-500" onClick={back}>← {t("common.back")}</button>
      )}

      {step !== "service" && service && (
        <div className="mb-4 rounded-2xl bg-stone-50 p-3 text-sm">
          <div className="font-semibold">{service.name}</div>
          <div className="text-stone-500">
            {duration(service.duration_minutes)} · {money(service.price, service.currency)}
            {step !== "staff" && eligible.length > 1 && ` · ${staff.find((s) => s.id === staffId)?.name ?? t("booking.any_staff")}`}
          </div>
          {slot && step === "details" && <SlotLabel iso={slot} />}
        </div>
      )}

      {step === "service" && (
        <section>
          <h2 className="mb-3 text-xl font-bold">{t("booking.select_service")}</h2>
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s.id}>
                <button onClick={() => chooseService(s.id)} className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left active:bg-stone-50 hover:border-brand-300">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{s.name}</div>
                    {s.description && <div className="line-clamp-2 text-sm text-stone-500">{s.description}</div>}
                    <div className="mt-0.5 text-sm text-stone-500">{duration(s.duration_minutes)}</div>
                  </div>
                  <div className="font-semibold tabular-nums">{money(s.price, s.currency)}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === "staff" && (
        <section>
          <h2 className="mb-3 text-xl font-bold">{t("booking.select_staff")}</h2>
          <ul className="space-y-2">
            {[{ id: null as string | null, name: t("booking.any_staff"), color: null as string | null }, ...eligible].map((s) => (
              <li key={s.id ?? "any"}>
                <button
                  onClick={() => { setStaffId(s.id); setSlot(null); setStep("time"); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-brand-300"
                >
                  <span className="flex size-10 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: s.color ?? "#a8a29e" }}>
                    {s.id ? s.name[0] : "✨"}
                  </span>
                  <span className="font-semibold">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === "time" && serviceId && (
        <section>
          <h2 className="mb-3 text-xl font-bold">{t("booking.select_time")}</h2>
          <SlotPicker
            slug={slug}
            serviceId={serviceId}
            staffId={staffId}
            value={slot}
            onChange={(s) => { setSlot(s); setStep("details"); }}
            renderEmpty={(date) => <WaitlistForm slug={slug} serviceId={serviceId} staffId={staffId} date={date} />}
          />
        </section>
      )}

      {step === "details" && serviceId && slot && (
        <DetailsForm
          onSubmit={async (contact) => {
            const r = await createPublicBooking({ ...contact, slug, serviceId, staffId, startAt: slot, rebookToken });
            if (!r.ok) {
              if (r.error === "errors.slot_taken") setStep("time");
              return t(r.error as MessageKey);
            }
            router.push(`/${slug}/a/${r.data.token}?new=1`);
            return null;
          }}
          submitLabel={t("booking.confirm")}
        />
      )}
    </div>
  );
}

function SlotLabel({ iso }: { iso: string }) {
  const { date, time } = useI18n();
  return <div className="mt-1 font-medium first-letter:uppercase text-brand-700">📅 {date(iso, { weekday: "long", day: "numeric", month: "long" })} · {time(iso)}</div>;
}

/** Date strip + time grid, backed by the public availability API. */
export function SlotPicker({ slug, serviceId, staffId, value, onChange, token, renderEmpty }: {
  slug: string;
  serviceId: string;
  staffId: string | null;
  value: string | null;
  onChange: (iso: string) => void;
  token?: string;
  renderEmpty?: (date: string) => React.ReactNode;
}) {
  const { t, locale, timezone, time } = useI18n();
  const today = DateTime.now().setZone(timezone).toISODate()!;
  const [from, setFrom] = useState(today);
  const [days, setDays] = useState<DaySlots[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    const qs = new URLSearchParams({ service: serviceId, from, days: "14", ...(staffId ? { staff: staffId } : {}), ...(token ? { token } : {}) });
    fetch(`/api/public/${slug}/availability?${qs}`)
      .then((r) => r.json())
      .then((d: { dates: DaySlots[] }) => {
        if (cancelled) return;
        setDays(d.dates ?? []);
        setSelectedDate((cur) => (cur && d.dates.some((x) => x.date === cur) ? cur : d.dates.find((x) => x.slots.length)?.date ?? d.dates[0]?.date ?? null));
      })
      .catch(() => !cancelled && setDays([]));
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, staffId, from, token]);

  const current = days?.find((d) => d.date === selectedDate);
  const periods = current
    ? [
        { key: "morning" as const, slots: current.slots.filter((s) => DateTime.fromISO(s.start).setZone(timezone).hour < 12) },
        { key: "afternoon" as const, slots: current.slots.filter((s) => { const h = DateTime.fromISO(s.start).setZone(timezone).hour; return h >= 12 && h < 17; }) },
        { key: "evening" as const, slots: current.slots.filter((s) => DateTime.fromISO(s.start).setZone(timezone).hour >= 17) },
      ].filter((p) => p.slots.length)
    : [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button className="btn-ghost btn-sm" disabled={from <= today} onClick={() => setFrom(DateTime.fromISO(from).minus({ days: 14 }).toISODate()! < today ? today : DateTime.fromISO(from).minus({ days: 14 }).toISODate()!)}>‹</button>
        <span className="text-sm font-medium capitalize text-stone-600">{DateTime.fromISO(selectedDate ?? from).setLocale(locale).toFormat("LLLL yyyy")}</span>
        <button className="btn-ghost btn-sm" onClick={() => setFrom(DateTime.fromISO(from).plus({ days: 14 }).toISODate()!)}>›</button>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {(days ?? Array.from({ length: 7 }, (_, i) => ({ date: DateTime.fromISO(from).plus({ days: i }).toISODate()!, slots: [] }))).map((d) => {
          const dt = DateTime.fromISO(d.date).setLocale(locale);
          const has = d.slots.length > 0;
          return (
            <button
              key={d.date}
              onClick={() => setSelectedDate(d.date)}
              disabled={!days}
              className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 ${
                selectedDate === d.date ? "border-brand-500 bg-brand-600 text-white" : has ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-50 text-stone-400"
              }`}
            >
              <span className="text-[11px] uppercase">{dt.toFormat("ccc")}</span>
              <span className="text-lg font-bold">{dt.day}</span>
              <span className={`mt-0.5 size-1.5 rounded-full ${has ? (selectedDate === d.date ? "bg-white" : "bg-green-500") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      <div className="mt-3 min-h-40">
        {!days ? (
          <p className="py-8 text-center text-sm text-stone-400">{t("common.loading")}</p>
        ) : periods.length ? (
          periods.map((p) => (
            <div key={p.key} className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{t(`booking.${p.key}`)}</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {p.slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => onChange(s.start)}
                    className={`rounded-xl border py-2.5 text-sm font-semibold tabular-nums ${value === s.start ? "border-brand-500 bg-brand-600 text-white" : "border-stone-200 bg-white hover:border-brand-400"}`}
                  >
                    {time(s.start)}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-stone-500">{t("booking.no_times")}</p>
            {days.some((d) => d.slots.length) && (
              <button className="mt-2 text-sm font-semibold text-brand-600" onClick={() => setSelectedDate(days.find((d) => d.slots.length)!.date)}>
                {t("booking.first_available")}
              </button>
            )}
            {selectedDate && renderEmpty?.(selectedDate)}
          </div>
        )}
      </div>
    </div>
  );
}

type Contact = { first_name: string; last_name: string; phone: string; email: string; notes: string; website: string };

function DetailsForm({ onSubmit, submitLabel, compact }: { onSubmit: (c: Contact) => Promise<string | null>; submitLabel: string; compact?: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      action={(f) =>
        start(async () => {
          setError(null);
          const err = await onSubmit({
            first_name: String(f.get("first_name") ?? ""),
            last_name: String(f.get("last_name") ?? ""),
            phone: String(f.get("phone") ?? ""),
            email: String(f.get("email") ?? ""),
            notes: String(f.get("notes") ?? ""),
            website: String(f.get("website") ?? ""),
          });
          if (err) setError(err);
        })
      }
    >
      {!compact && <h2 className="text-xl font-bold">{t("booking.your_details")}</h2>}
      <div className="grid grid-cols-2 gap-2">
        <input className="input" name="first_name" placeholder={t("customer.first_name")} autoComplete="given-name" required />
        <input className="input" name="last_name" placeholder={t("customer.last_name")} autoComplete="family-name" />
      </div>
      <input className="input" name="phone" type="tel" placeholder={t("customer.phone")} autoComplete="tel" required />
      {!compact && <input className="input" name="email" type="email" placeholder={t("booking.email_placeholder")} autoComplete="email" />}
      {!compact && <textarea className="input" name="notes" rows={2} placeholder={`${t("booking.notes_placeholder")} (${t("common.optional")})`} />}
      <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full py-3 text-base" disabled={pending}>{pending ? t("common.loading") : submitLabel}</button>
      {!compact && <p className="text-center text-xs text-stone-400">{t("booking.no_account_needed")}</p>}
    </form>
  );
}

function WaitlistForm({ slug, serviceId, staffId, date }: { slug: string; serviceId: string; staffId: string | null; date: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (done) return <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">✓ {t("booking.waitlist_joined")}</p>;
  if (!open)
    return (
      <button className="btn-secondary mt-4" onClick={() => setOpen(true)}>
        ⏳ {t("booking.join_waitlist")}
      </button>
    );
  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-stone-50 p-4 text-left">
      <p className="text-sm font-medium first-letter:uppercase">{t("booking.waitlist_for", { date: DateTime.fromISO(date).setLocale(locale).toFormat("cccc d LLLL") })}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-stone-500">{t("waitlist.from")}<input className="input mt-1" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-stone-500">{t("waitlist.to")}<input className="input mt-1" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <DetailsForm
        compact
        submitLabel={t("booking.join_waitlist")}
        onSubmit={async (c) => {
          const r = await joinPublicWaitlist({ ...c, slug, serviceId, staffId, preferredDate: date, preferredStart: from || null, preferredEnd: to || null });
          if (!r.ok) return t(r.error as MessageKey);
          setDone(true);
          return null;
        }}
      />
    </div>
  );
}
