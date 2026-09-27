"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { useI18n } from "@/components/I18nProvider";
import { createPublicBooking, joinPublicWaitlist } from "@/app/actions/public";
import { attachLook, finishReferenceUpload, startReferenceUpload } from "@/app/actions/photos";
import { Modal } from "@/components/Modal";
import { PhotoPicker, uploadPhotos } from "@/components/Photos";
import type { PublicCatalog } from "@/lib/booking/public";
import type { MessageKey } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";

type Step = "service" | "staff" | "time" | "details";
const MAX_SERVICES = 5;
type DaySlots = { date: string; slots: { start: string; end: string }[] };

export type PublicLook = { id: string; url: string; serviceId: string };

export function BookingFlow({ slug, catalog, looks, initialServiceId, initialStaffId, rebookToken, isTest }: {
  slug: string;
  catalog: PublicCatalog;
  looks: PublicLook[];
  initialServiceId: string | null;
  initialStaffId: string | null;
  rebookToken: string | null;
  isTest: boolean;
}) {
  const { t, money, duration } = useI18n();
  const router = useRouter();
  const { services, staff, links } = catalog;

  // Staff who can do every selected service (a service with no assignments can be done by anyone).
  const eligibleFor = (ids: string[]) =>
    staff.filter((s) =>
      ids.every((id) => {
        const assigned = links.filter((l) => l.service_id === id).map((l) => l.staff_id);
        return !assigned.length || assigned.includes(s.id);
      }),
    );

  const validService = services.find((s) => s.id === initialServiceId)?.id ?? null;
  const [selected, setSelected] = useState<string[]>(validService ? [validService] : []);
  const [staffId, setStaffId] = useState<string | null>(validService && eligibleFor([validService]).some((s) => s.id === initialStaffId) ? initialStaffId : null);
  const [step, setStep] = useState<Step>(validService ? (eligibleFor([validService]).length > 1 && !initialStaffId ? "staff" : "time") : "service");
  const [slot, setSlot] = useState<string | null>(null);
  const [look, setLook] = useState<PublicLook | null>(null);
  const [viewing, setViewing] = useState<PublicLook | null>(null);

  // Selected services are done back to back: durations and prices add up.
  const chosen = selected.map((id) => services.find((s) => s.id === id)).filter((s): s is PublicCatalog["services"][number] => !!s);
  const totalMinutes = chosen.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalPrice = chosen.reduce((sum, s) => sum + s.price, 0);
  const currency = chosen[0]?.currency ?? services[0]?.currency ?? "USD";
  const eligible = selected.length ? eligibleFor(selected) : [];

  function toggleService(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < MAX_SERVICES ? [...selected, id] : selected;
    setSelected(next);
    if (look && !next.includes(look.serviceId)) setLook(null);
    setSlot(null);
  }

  function proceed(ids: string[] = selected) {
    setSlot(null);
    const e = eligibleFor(ids);
    if (e.length > 1) setStep("staff");
    else {
      setStaffId(e[0]?.id ?? null);
      setStep("time");
    }
  }

  function chooseLook(l: PublicLook) {
    setLook(l);
    setSelected([l.serviceId]);
    proceed([l.serviceId]);
  }

  const back = () => {
    if (step === "details") setStep("time");
    else if (step === "time") setStep(eligible.length > 1 ? "staff" : "service");
    else if (step === "staff") setStep("service");
  };

  if (!services.length) return <p className="p-6 text-center text-stone-500">{t("booking.no_services")}</p>;

  return (
    <div className="px-5 pb-12 pt-2 sm:px-6">
      {isTest && (
        <p className="mb-4 flex gap-3 rounded-2xl bg-warn-100 p-4 text-sm text-warn-700">
          <Icon name="science" size={20} />
          {t("booking.test_banner")}
        </p>
      )}
      {step !== "service" && (
        <button className="btn-ghost -ml-3 mb-2" onClick={back}><Icon name="back" size={18} />{t("common.back")}</button>
      )}

      {step !== "service" && chosen.length > 0 && (
        <div className="mb-6 flex gap-4 rounded-[20px] bg-surface p-5">
          {look && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={look.url} alt="" className="h-20 w-16 shrink-0 rounded-2xl object-cover" />
          )}
          <div className="min-w-0 flex-1">
          {look && <div className="mb-0.5 text-xs text-stone-500">{t("lookbook.your_look")}</div>}
          <div className="text-[15px] font-semibold text-stone-900">{chosen.map((s) => s.name).join(" + ")}</div>
          <div className="mt-0.5 text-sm text-stone-500">
            {duration(totalMinutes)} · {money(totalPrice, currency)}
            {step !== "staff" && eligible.length > 1 && ` · ${staff.find((s) => s.id === staffId)?.name ?? t("booking.any_staff")}`}
          </div>
          {slot && step === "details" && <SlotLabel iso={slot} />}
          </div>
        </div>
      )}

      {step === "service" && looks.length > 0 && (
        <section className="mb-8">
          <h2 className="h2 text-[24px]">{t("lookbook.public_title")}</h2>
          <p className="mb-3 mt-1 text-sm text-stone-500">{t("lookbook.public_hint")}</p>
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6">
            {looks.map((l) => (
              <button key={l.id} onClick={() => setViewing(l)} className="group relative aspect-[4/5] w-40 shrink-0 snap-start overflow-hidden rounded-[20px] bg-stone-100 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.url} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                <span className="absolute inset-x-2 bottom-2 truncate rounded-full bg-surface/90 px-3 py-1.5 text-xs font-medium text-stone-900">
                  {services.find((s) => s.id === l.serviceId)?.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {viewing && (
        <LookSheet
          look={viewing}
          service={services.find((s) => s.id === viewing.serviceId)!}
          onClose={() => setViewing(null)}
          onChoose={() => { const l = viewing; setViewing(null); chooseLook(l); }}
        />
      )}

      {step === "service" && (
        <section>
          <h2 className="h2 text-[24px]">{t("booking.select_service")}</h2>
          <p className="mb-4 mt-1 text-sm text-stone-500">{t("booking.select_services_hint")}</p>
          <ul className="space-y-2">
            {services.map((s) => {
              const on = selected.includes(s.id);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => toggleService(s.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-4 rounded-[20px] border p-5 text-left transition-colors ${on ? "border-brand-600 bg-brand-100" : "border-transparent bg-surface hover:bg-brand-100"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold text-stone-900">{s.name}</div>
                      {s.description && <div className="mt-0.5 line-clamp-2 text-sm text-stone-500">{s.description}</div>}
                      <div className="mt-1 text-sm text-stone-500">{duration(s.duration_minutes)} · {money(s.price, s.currency)}</div>
                    </div>
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${on ? "border-brand-600 bg-brand-600 text-white" : "border-brand-300"}`}>
                      {on && <Icon name="check" size={16} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 && eligible.length === 0 && <p className="mt-3 rounded-[20px] bg-warn-100 p-4 text-sm text-warn-700">{t("booking.no_staff_combo")}</p>}
          {selected.length > 0 && (
            <div className="sticky bottom-4 z-10 mt-4 flex items-center gap-3 rounded-full bg-forest p-2 pl-5 text-white shadow-float">
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-medium">{selected.length > 1 ? t("booking.selected_count", { count: selected.length }) : chosen[0]?.name}</div>
                <div className="text-white/75">{duration(totalMinutes)} · {money(totalPrice, currency)}</div>
              </div>
              <button className="btn h-11 bg-white font-semibold text-brand-700 hover:bg-brand-50" disabled={eligible.length === 0} onClick={() => proceed()}>
                {t("booking.continue")}
              </button>
            </div>
          )}
        </section>
      )}

      {step === "staff" && (
        <section>
          <h2 className="h2 mb-4 text-[24px]">{t("booking.select_staff")}</h2>
          <ul className="space-y-2">
            {[{ id: null as string | null, name: t("booking.any_staff"), color: null as string | null }, ...eligible].map((s) => (
              <li key={s.id ?? "any"}>
                <button
                  onClick={() => { setStaffId(s.id); setSlot(null); setStep("time"); }}
                  className="flex w-full items-center gap-4 rounded-[20px] bg-surface p-4 text-left transition-colors hover:bg-brand-100"
                >
                  {s.id ? (
                    <Avatar name={s.name} size={40} color={s.color} />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-full bg-peach text-stone-900"><Icon name="sparkle" size={20} /></span>
                  )}
                  <span className="flex-1 text-[15px] font-semibold text-stone-900">{s.name}</span>
                  <Icon name="chevronRight" size={20} className="text-stone-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === "time" && selected.length > 0 && (
        <section>
          <h2 className="h2 mb-4 text-[24px]">{t("booking.select_time")}</h2>
          <SlotPicker
            slug={slug}
            serviceIds={selected}
            staffId={staffId}
            value={slot}
            onChange={(s) => { setSlot(s); setStep("details"); }}
            renderEmpty={(date) => <WaitlistForm slug={slug} serviceId={selected[0]} staffId={staffId} date={date} />}
          />
        </section>
      )}

      {step === "details" && selected.length > 0 && slot && (
        <DetailsForm
          onSubmit={async (contact, photos) => {
            const r = await createPublicBooking({ ...contact, slug, serviceIds: selected, staffId, startAt: slot, rebookToken });
            if (!r.ok) {
              if (r.error === "errors.slot_taken") setStep("time");
              return t(r.error as MessageKey);
            }
            // The booking is already made; photos are a bonus and never block it.
            const token = r.data.token;
            const attached = look ? await attachLook(slug, token, look.id).catch(() => ({ ok: false })) : null;
            const upload = photos.length
              ? await uploadPhotos(photos, (types) => startReferenceUpload(slug, token, types), (paths) => finishReferenceUpload(slug, token, paths)).catch(() => ({ count: 0, error: "errors.generic" }))
              : null;
            router.push(`/${slug}/a/${token}?new=1${upload?.error || attached?.ok === false ? "&photos=failed" : ""}`);
            return null;
          }}
          withPhotos
          maxPhotos={look ? 2 : 3}
          submitLabel={t("booking.confirm")}
        />
      )}
    </div>
  );
}

function SlotLabel({ iso }: { iso: string }) {
  const { date, time } = useI18n();
  return <div className="mt-2 text-sm font-medium text-brand-700 first-letter:uppercase">{date(iso, { weekday: "long", day: "numeric", month: "long" })} · {time(iso)}</div>;
}

/** Date strip + time grid, backed by the public availability API. */
export function SlotPicker({ slug, serviceIds, staffId, value, onChange, token, renderEmpty }: {
  slug: string;
  serviceIds: string[];
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
  const servicesKey = serviceIds.join(",");

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    const qs = new URLSearchParams({ services: servicesKey, from, days: "14", ...(staffId ? { staff: staffId } : {}), ...(token ? { token } : {}) });
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
  }, [slug, servicesKey, staffId, from, token]);

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
        <button className="icon-btn" disabled={from <= today} onClick={() => setFrom(DateTime.fromISO(from).minus({ days: 14 }).toISODate()! < today ? today : DateTime.fromISO(from).minus({ days: 14 }).toISODate()!)} aria-label="prev"><Icon name="chevronLeft" size={22} /></button>
        <span className="text-[15px] font-medium text-stone-900 first-letter:uppercase">{DateTime.fromISO(selectedDate ?? from).setLocale(locale).toFormat("LLLL yyyy")}</span>
        <button className="icon-btn" onClick={() => setFrom(DateTime.fromISO(from).plus({ days: 14 }).toISODate()!)} aria-label="next"><Icon name="chevronRight" size={22} /></button>
      </div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2">
        {(days ?? Array.from({ length: 7 }, (_, i) => ({ date: DateTime.fromISO(from).plus({ days: i }).toISODate()!, slots: [] }))).map((d) => {
          const dt = DateTime.fromISO(d.date).setLocale(locale);
          const has = d.slots.length > 0;
          return (
            <button
              key={d.date}
              onClick={() => setSelectedDate(d.date)}
              disabled={!days}
              aria-pressed={selectedDate === d.date}
              className={`flex w-14 shrink-0 flex-col items-center rounded-full border py-3 transition-colors ${
                selectedDate === d.date ? "border-brand-600 bg-brand-600 text-white" : has ? "border-brand-200 bg-surface text-stone-900 hover:bg-brand-100" : "border-transparent text-stone-400"
              }`}
            >
              <span className="text-xs first-letter:uppercase">{dt.toFormat("ccc")}</span>
              <span className="text-lg font-medium">{dt.day}</span>
              <span className={`mt-0.5 size-1.5 rounded-full ${has ? (selectedDate === d.date ? "bg-surface" : "bg-gold") : "bg-transparent"}`} />
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
              <h3 className="mb-2 text-sm text-stone-500">{t(`booking.${p.key}`)}</h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {p.slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => onChange(s.start)}
                    aria-pressed={value === s.start}
                    className="choice tabular-nums"
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
              <button className="btn-ghost mt-2" onClick={() => setSelectedDate(days.find((d) => d.slots.length)!.date)}>
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

function DetailsForm({ onSubmit, submitLabel, compact, withPhotos, maxPhotos = 3 }: { onSubmit: (c: Contact, photos: File[]) => Promise<string | null>; submitLabel: string; compact?: boolean; withPhotos?: boolean; maxPhotos?: number }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
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
          }, photos);
          if (err) setError(err);
        })
      }
    >
      {!compact && <h2 className="h2 text-[24px]">{t("booking.your_details")}</h2>}
      <div className="grid grid-cols-2 gap-2">
        <input className="input" name="first_name" placeholder={t("customer.first_name")} autoComplete="given-name" required />
        <input className="input" name="last_name" placeholder={t("customer.last_name")} autoComplete="family-name" />
      </div>
      <input className="input" name="phone" type="tel" placeholder={t("customer.phone")} autoComplete="tel" required />
      {!compact && <input className="input" name="email" type="email" placeholder={t("booking.email_placeholder")} autoComplete="email" />}
      {!compact && <textarea className="input" name="notes" rows={2} placeholder={`${t("booking.notes_placeholder")} (${t("common.optional")})`} />}
      {withPhotos && (
        <div className="rounded-[20px] bg-surface p-4">
          <div className="text-[15px] font-semibold text-stone-900">{t("photos.reference_title")}</div>
          <p className="mb-3 mt-0.5 text-sm text-stone-500">{t("photos.reference_hint")}</p>
          <PhotoPicker files={photos} onChange={setPhotos} max={maxPhotos} />
        </div>
      )}
      <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {error && <p className="text-sm text-bad-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? (photos.length ? t("photos.uploading") : t("common.loading")) : submitLabel}</button>
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

  if (done) return <p className="mt-4 flex items-center gap-2 rounded-[20px] bg-ok-100 p-4 text-sm text-ok-700"><Icon name="check" size={18} />{t("booking.waitlist_joined")}</p>;
  if (!open)
    return (
      <button className="btn-secondary mt-4" onClick={() => setOpen(true)}>
        <Icon name="hourglass" size={18} />{t("booking.join_waitlist")}
      </button>
    );
  return (
    <div className="mt-4 space-y-3 rounded-[20px] bg-surface p-5 text-left">
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

/** Full view of a look with the one action that matters: book it. */
function LookSheet({ look, service, onClose, onChoose }: { look: PublicLook; service: PublicCatalog["services"][number]; onClose: () => void; onChoose: () => void }) {
  const { t, money, duration } = useI18n();
  return (
    <Modal open onClose={onClose} title={service.name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={look.url} alt="" className="aspect-[4/5] w-full rounded-[26px] object-cover" />
      <p className="mt-4 text-[15px] text-stone-500">{duration(service.duration_minutes)} · {money(service.price, service.currency)}</p>
      {service.description && <p className="mt-1 text-sm text-stone-500">{service.description}</p>}
      <button className="btn-primary mt-5 w-full" onClick={onChoose}>
        <Icon name="sparkle" size={18} />
        {t("lookbook.want")}
      </button>
    </Modal>
  );
}
