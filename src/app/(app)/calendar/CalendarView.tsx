"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/Modal";
import { StatusBadge, STATUS_STYLES } from "@/components/StatusBadge";
import { AppointmentForm, type AppointmentPrefill, type FormService, type FormStaff, type PickerCustomer } from "@/components/AppointmentForm";
import { moveAppointment, setAppointmentStatus, updateAppointmentDetails } from "@/app/actions/appointments";
import { getWorkingIntervals, type AvailabilityException, type AvailabilityRule } from "@/lib/booking/engine";
import { localTimeOf, zonedToUtc } from "@/lib/i18n/format";
import { formatPhone } from "@/lib/phone";
import type { MessageKey } from "@/lib/i18n";
import type { AppointmentStatus } from "@/lib/types";

export type CalendarAppointment = {
  id: string;
  customer_id: string;
  staff_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  price: number;
  currency: string;
  notes: string | null;
  source: string;
  customer: { id: string; first_name: string; last_name: string | null; phone: string | null } | null;
  service: { name: string; duration_minutes: number } | null;
};

type Props = {
  date: string;
  view: "day" | "week";
  days: string[];
  staffFilter: string | null;
  appointments: CalendarAppointment[];
  staff: FormStaff[];
  services: FormService[];
  staffServices: { staff_id: string; service_id: string }[];
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  weekStart: number;
  prefill: (Omit<AppointmentPrefill, "customer"> & { customer: PickerCustomer | null }) | null;
};

const HOUR_PX = 64;
const SNAP_MIN = 15;

export function CalendarView(props: Props) {
  const { date, view, days, staffFilter, appointments, staff, services, staffServices, rules, exceptions } = props;
  const router = useRouter();
  const { t, locale, timezone, time } = useI18n();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState<AppointmentPrefill | null>(props.prefill ? { ...props.prefill, date: props.prefill.date ?? date } : null);
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const nav = (params: Record<string, string | null>) => {
    const sp = new URLSearchParams({ date, view, ...(staffFilter ? { staff: staffFilter } : {}) });
    for (const [k, v] of Object.entries(params)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/calendar?${sp}`);
  };

  const shift = (n: number) => nav({ date: DateTime.fromISO(date).plus({ days: view === "week" ? 7 * n : n }).toISODate()! });

  // Visible hour range: working hours ± 1h, at least 8–20.
  const [startHour, endHour] = useMemo(() => {
    let min = 8;
    let max = 20;
    for (const r of rules) {
      min = Math.min(min, Number(r.start_time.slice(0, 2)));
      max = Math.max(max, Math.ceil(Number(r.end_time.slice(0, 2)) + Number(r.end_time.slice(3, 5)) / 60));
    }
    for (const a of appointments) {
      const s = DateTime.fromISO(a.start_at).setZone(timezone);
      const e = DateTime.fromISO(a.end_at).setZone(timezone);
      min = Math.min(min, s.hour);
      max = Math.max(max, e.hour + (e.minute ? 1 : 0));
    }
    return [Math.max(0, min), Math.min(24, max)];
  }, [rules, appointments, timezone]);

  const visibleStaff = staffFilter ? staff.filter((s) => s.id === staffFilter) : staff;
  const columns =
    view === "day"
      ? visibleStaff.map((s) => ({ key: s.id, date, staffIds: [s.id], title: staff.length > 1 ? s.name : DateTime.fromISO(date).setLocale(locale).toFormat("cccc d LLL"), color: s.color }))
      : days.map((d) => ({ key: d, date: d, staffIds: visibleStaff.map((s) => s.id), title: DateTime.fromISO(d).setLocale(locale).toFormat("ccc d"), color: null as string | null }));

  const minutesOf = (iso: string) => {
    const d = DateTime.fromISO(iso).setZone(timezone);
    return d.hour * 60 + d.minute;
  };

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(t((r.error ?? "errors.generic") as MessageKey));
      else {
        setSelected(null);
        router.refresh();
      }
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>, col: (typeof columns)[number]) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/appointment");
    const appt = appointments.find((a) => a.id === id);
    if (!appt) return;
    const offset = Number(e.dataTransfer.getData("text/offset") || 0);
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = Math.round(((e.clientY - rect.top - offset) / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN + startHour * 60;
    const clamped = Math.max(0, Math.min(24 * 60 - SNAP_MIN, minutes));
    const hhmm = `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
    const startAt = zonedToUtc(col.date, hhmm, timezone);
    const staffId = view === "day" ? col.staffIds[0] : appt.staff_id;
    if (startAt === new Date(appt.start_at).toISOString() && staffId === appt.staff_id) return;
    act(() => moveAppointment({ id: appt.id, startAt, staffId }));
  }

  function onEmptyClick(e: React.MouseEvent<HTMLDivElement>, col: (typeof columns)[number]) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN + startHour * 60;
    const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    setCreating({ date: col.date, time: hhmm, staffId: view === "day" ? col.staffIds[0] : staffFilter });
  }

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const heading = view === "day"
    ? DateTime.fromISO(date).setLocale(locale).toFormat("cccc d LLLL")
    : `${DateTime.fromISO(days[0]).setLocale(locale).toFormat("d LLL")} – ${DateTime.fromISO(days[6]).setLocale(locale).toFormat("d LLL yyyy")}`;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h1 mr-auto first-letter:uppercase">{heading}</h1>
        <div className="flex rounded-xl border border-stone-300 bg-white p-0.5">
          {(["day", "week"] as const).map((v) => (
            <button key={v} onClick={() => nav({ view: v })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === v ? "bg-brand-600 text-white" : "text-stone-600"}`}>
              {t(`calendar.${v}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button className="btn-secondary btn-sm" onClick={() => shift(-1)} aria-label="prev">‹</button>
          <button className="btn-secondary btn-sm" onClick={() => nav({ date: DateTime.now().setZone(timezone).toISODate()! })}>{t("calendar.today")}</button>
          <button className="btn-secondary btn-sm" onClick={() => shift(1)} aria-label="next">›</button>
        </div>
        <button className="btn-primary btn-sm" onClick={() => setCreating({ date })}>+ {t("calendar.new_appointment")}</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className="input w-auto py-1.5" value={date} onChange={(e) => e.target.value && nav({ date: e.target.value })} />
        {staff.length > 1 && (
          <select className="input w-auto py-1.5" value={staffFilter ?? ""} onChange={(e) => nav({ staff: e.target.value || null })}>
            <option value="">{t("calendar.all_staff")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input type="checkbox" className="accent-brand-600" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          {t("calendar.show_cancelled")}
        </label>
        <span className="ml-auto hidden text-xs text-stone-400 md:inline">{t("calendar.drag_hint")}</span>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!services.length && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t("calendar.no_services")} <Link className="font-semibold underline" href="/services">{t("nav.services")}</Link>
        </p>
      )}

      <div className={`overflow-x-auto rounded-2xl border border-stone-200 bg-white ${pending ? "opacity-70" : ""}`}>
        <div className="flex" style={{ minWidth: columns.length > 1 ? columns.length * 140 + 56 : undefined }}>
          <div className="w-14 shrink-0 border-r border-stone-100">
            <div className="h-10 border-b border-stone-200" />
            {hours.map((h) => (
              <div key={h} className="relative text-right text-[11px] text-stone-400" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-1.5 whitespace-nowrap">{new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h))}</span>
              </div>
            ))}
          </div>
          {columns.map((col) => {
            const colAppts = appointments.filter(
              (a) => localTimeOf(a.start_at, timezone) && DateTime.fromISO(a.start_at).setZone(timezone).toISODate() === col.date && col.staffIds.includes(a.staff_id) && (showCancelled || a.status !== "cancelled"),
            );
            // Shade working hours of the column's staff.
            const working = col.staffIds.flatMap((sid) => getWorkingIntervals(sid, col.date, timezone, rules, exceptions));
            const dayStart = DateTime.fromISO(col.date, { zone: timezone }).startOf("day").toMillis();
            return (
              <div key={col.key} className="min-w-[140px] flex-1 border-r border-stone-100 last:border-r-0">
                <div className="sticky top-0 z-10 flex h-10 items-center justify-center gap-1.5 border-b border-stone-200 bg-white px-2 text-sm font-semibold capitalize">
                  {col.color && <span className="size-2.5 rounded-full" style={{ background: col.color }} />}
                  {view === "week" ? (
                    <button onClick={() => nav({ date: col.date, view: "day" })} className={col.date === DateTime.now().setZone(timezone).toISODate() ? "text-brand-600" : ""}>{col.title}</button>
                  ) : (
                    col.title
                  )}
                </div>
                <div
                  className="relative cursor-pointer bg-stone-50"
                  style={{ height: hours.length * HOUR_PX }}
                  onClick={(e) => onEmptyClick(e, col)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, col)}
                >
                  {working.map((w, i) => {
                    const top = ((w.start - dayStart) / 60000 - startHour * 60) * (HOUR_PX / 60);
                    const height = ((w.end - w.start) / 60000) * (HOUR_PX / 60);
                    return <div key={i} className="pointer-events-none absolute inset-x-0 bg-white" style={{ top, height }} />;
                  })}
                  {hours.map((h, i) => (
                    <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-stone-100" style={{ top: i * HOUR_PX }} />
                  ))}
                  {colAppts.map((a) => {
                    const top = (minutesOf(a.start_at) - startHour * 60) * (HOUR_PX / 60);
                    const height = Math.max(22, ((Date.parse(a.end_at) - Date.parse(a.start_at)) / 60000) * (HOUR_PX / 60) - 2);
                    const color = staffById.get(a.staff_id)?.color ?? "#db2777";
                    return (
                      <button
                        key={a.id}
                        draggable={a.status !== "cancelled"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/appointment", a.id);
                          e.dataTransfer.setData("text/offset", String(e.clientY - e.currentTarget.getBoundingClientRect().top));
                        }}
                        onClick={() => setSelected(a)}
                        className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm ${a.status === "cancelled" ? "bg-stone-100 opacity-60" : "bg-white hover:shadow-md"}`}
                        style={{ top, height, borderLeftColor: color }}
                      >
                        <div className="truncate font-semibold">{a.customer?.first_name} {a.customer?.last_name}</div>
                        <div className="truncate text-stone-500">{time(a.start_at)} · {a.service?.name}</div>
                        {view === "week" && staff.length > 1 && <div className="truncate text-stone-400">{staffById.get(a.staff_id)?.name}</div>}
                        {a.status !== "scheduled" && <span className={`chip mt-0.5 ${STATUS_STYLES[a.status]}`}>{t(`status.${a.status}`)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={!!creating} onClose={() => setCreating(null)} title={creating?.rebookedFromId ? t("appointment.rebook") : t("calendar.new_appointment")}>
        {creating && (
          <AppointmentForm
            services={services}
            staff={staff}
            staffServices={staffServices}
            prefill={creating}
            defaultDate={date}
            onDone={() => {
              setCreating(null);
              if (props.prefill) router.replace(`/calendar?date=${creating.date ?? date}&view=${view}`);
              router.refresh();
            }}
          />
        )}
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t("appointment.details")}>
        {selected && (
          <AppointmentDetails
            appt={selected}
            staff={staff}
            pending={pending}
            error={error}
            onStatus={(s) => act(() => setAppointmentStatus(selected.id, s))}
            onMove={(startAt, staffId) => act(() => moveAppointment({ id: selected.id, startAt, staffId }))}
            onNotes={(notes) => act(() => updateAppointmentDetails(selected.id, { notes }))}
            onRebook={() => {
              const s = selected;
              setSelected(null);
              setCreating({
                customer: s.customer ? { ...s.customer } : null,
                serviceId: s.service_id,
                staffId: s.staff_id,
                date: DateTime.fromISO(s.start_at).setZone(timezone).plus({ weeks: 4 }).toISODate()!,
                time: localTimeOf(s.start_at, timezone),
                rebookedFromId: s.id,
              });
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function AppointmentDetails({ appt, staff, pending, error, onStatus, onMove, onNotes, onRebook }: {
  appt: CalendarAppointment;
  staff: FormStaff[];
  pending: boolean;
  error: string | null;
  onStatus: (s: AppointmentStatus) => void;
  onMove: (startAt: string, staffId: string) => void;
  onNotes: (notes: string) => void;
  onRebook: () => void;
}) {
  const { t, money, timezone, dateTime, time } = useI18n();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(DateTime.fromISO(appt.start_at).setZone(timezone).toISODate()!);
  const [hhmm, setHhmm] = useState(localTimeOf(appt.start_at, timezone));
  const [staffId, setStaffId] = useState(appt.staff_id);
  const [notes, setNotes] = useState(appt.notes ?? "");
  const active = appt.status === "scheduled" || appt.status === "confirmed";

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/customers/${appt.customer_id}`} className="text-lg font-semibold text-brand-700 hover:underline">
          {appt.customer?.first_name} {appt.customer?.last_name}
        </Link>
        {appt.customer?.phone && <div className="text-sm text-stone-500">{formatPhone(appt.customer.phone)}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-stone-500">{t("appointment.service")}</dt><dd className="font-medium">{appt.service?.name}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.staff")}</dt><dd className="font-medium">{staff.find((s) => s.id === appt.staff_id)?.name}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.when")}</dt><dd className="font-medium first-letter:uppercase">{dateTime(appt.start_at)}–{time(appt.end_at)}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.price")}</dt><dd className="font-medium">{money(Number(appt.price), appt.currency)}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.status")}</dt><dd><StatusBadge status={appt.status} /></dd></div>
        <div><dt className="text-stone-500">{t("appointment.source")}</dt><dd className="font-medium">{t(`source.${appt.source}` as MessageKey)}</dd></div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {appt.status === "scheduled" && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => onStatus("confirmed")}>✓ {t("appointment.confirm")}</button>}
        {active && <button className="btn-primary btn-sm" disabled={pending} onClick={() => onStatus("completed")}>{t("appointment.complete")}</button>}
        {active && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => onStatus("no_show")}>{t("appointment.no_show")}</button>}
        {active && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => setEditing(!editing)}>{t("appointment.reschedule")}</button>}
        {active && <button className="btn-danger btn-sm" disabled={pending} onClick={() => confirm(t("appointment.cancel_confirm")) && onStatus("cancelled")}>{t("appointment.cancel")}</button>}
        {!active && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => onStatus("scheduled")}>{t("appointment.reopen")}</button>}
        <button className="btn-secondary btn-sm" onClick={onRebook}>↻ {t("appointment.rebook")}</button>
      </div>

      {appt.status === "completed" && (
        <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
          {t("appointment.rebook_prompt")} <button className="font-semibold underline" onClick={onRebook}>{t("appointment.schedule_next")}</button>
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-xl bg-stone-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="input" type="time" step={300} value={hhmm} onChange={(e) => setHhmm(e.target.value)} />
          </div>
          {staff.length > 1 && (
            <select className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button className="btn-primary btn-sm w-full" disabled={pending} onClick={() => onMove(zonedToUtc(date, hhmm, timezone), staffId)}>{t("common.save")}</button>
        </div>
      )}

      <div>
        <label className="label">{t("appointment.notes")}</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== (appt.notes ?? "") && <button className="btn-secondary btn-sm mt-2" disabled={pending} onClick={() => onNotes(notes)}>{t("common.save")}</button>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
