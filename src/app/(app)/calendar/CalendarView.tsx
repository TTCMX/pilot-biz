"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/components/StatusBadge";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
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

/** Side-by-side layout for overlapping events: returns column index and column count per event. */
function layoutOverlaps<T extends { id: string; start_at: string; end_at: string }>(items: T[]): Map<string, { col: number; cols: number }> {
  const sorted = [...items].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || Date.parse(b.end_at) - Date.parse(a.end_at));
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: { id: string; end: number; col: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.set(c.id, { col: c.col, cols });
    cluster = [];
  };
  for (const e of sorted) {
    const start = Date.parse(e.start_at);
    const end = Date.parse(e.end_at);
    if (start >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.end > start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ id: e.id, end, col });
    clusterEnd = Math.max(clusterEnd === -Infinity ? end : clusterEnd, end);
  }
  flush();
  return out;
}

/** Google Calendar–like event styles: confirmed = solid, scheduled = tinted, done = faded. */
function blockStyle(status: AppointmentStatus, color: string): React.CSSProperties {
  switch (status) {
    case "confirmed":
      return { background: color, color: "#fff" };
    case "completed":
      return { background: color, color: "#fff", opacity: 0.55 };
    case "cancelled":
      return { background: "#fff", color: "#5f6368", boxShadow: `inset 0 0 0 1px ${color}66` };
    case "no_show":
      return { background: "#ffefc9", color: "#5c4300", boxShadow: `inset 3px 0 0 ${color}` };
    default:
      return { background: `${color}26`, color: "#1f1f1f", boxShadow: `inset 3px 0 0 ${color}` };
  }
}
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  const todayLocal = DateTime.fromMillis(now).setZone(timezone).toISODate();
  const nowMinutes = (() => {
    const d = DateTime.fromMillis(now).setZone(timezone);
    return d.hour * 60 + d.minute;
  })();

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button className="btn-secondary btn-sm" onClick={() => nav({ date: DateTime.now().setZone(timezone).toISODate()! })}>{t("calendar.today")}</button>
        <div className="flex">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="prev"><Icon name="chevronLeft" size={24} /></button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="next"><Icon name="chevronRight" size={24} /></button>
        </div>
        <h1 className="mr-auto text-[22px] font-normal text-stone-900 first-letter:uppercase sm:text-[26px]">{heading}</h1>
        <div className="flex h-10 overflow-hidden rounded-full border border-stone-300">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              onClick={() => nav({ view: v })}
              className={`flex items-center gap-1.5 px-4 text-sm font-medium transition-colors ${view === v ? "bg-nav text-nav-on" : "bg-white text-stone-700 hover:bg-stone-100"} ${v === "week" ? "border-l border-stone-300" : ""}`}
            >
              {view === v && <Icon name="check" size={16} />}
              {t(`calendar.${v}`)}
            </button>
          ))}
        </div>
        <button className="btn-primary hidden sm:inline-flex md:hidden" onClick={() => setCreating({ date })}><Icon name="add" size={18} />{t("calendar.new_appointment")}</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className="input h-10 w-auto" value={date} onChange={(e) => e.target.value && nav({ date: e.target.value })} />
        {staff.length > 1 && (
          <select className="input h-10 w-auto" value={staffFilter ?? ""} onChange={(e) => nav({ staff: e.target.value || null })}>
            <option value="">{t("calendar.all_staff")}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-stone-600 hover:bg-stone-100">
          <input type="checkbox" className="size-4" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          {t("calendar.show_cancelled")}
        </label>
        <span className="ml-auto hidden text-xs text-stone-400 lg:inline">{t("calendar.drag_hint")}</span>
      </div>

      {error && <p className="rounded-2xl bg-bad-100 p-4 text-sm text-bad-700">{error}</p>}
      {!services.length && (
        <p className="rounded-2xl bg-warn-100 p-4 text-sm text-warn-700">
          {t("calendar.no_services")} <Link className="font-medium underline" href="/services">{t("nav.services")}</Link>
        </p>
      )}

      <div className={`overflow-x-auto rounded-3xl bg-white shadow-card ${pending ? "opacity-70" : ""}`}>
        <div className="flex" style={{ minWidth: columns.length > 1 ? columns.length * 140 + 64 : undefined }}>
          <div className="w-16 shrink-0">
            <div className="h-16" />
            {hours.map((h, i) => (
              <div key={h} className="relative text-right text-[11px] text-stone-500" style={{ height: HOUR_PX }}>
                {i > 0 && <span className="absolute -top-2 right-3 whitespace-nowrap">{new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h))}</span>}
              </div>
            ))}
          </div>
          {columns.map((col) => {
            const colAppts = appointments.filter(
              (a) => DateTime.fromISO(a.start_at).setZone(timezone).toISODate() === col.date && col.staffIds.includes(a.staff_id) && (showCancelled || a.status !== "cancelled"),
            );
            // Shade working hours of the column's staff.
            const working = col.staffIds.flatMap((sid) => getWorkingIntervals(sid, col.date, timezone, rules, exceptions));
            const dayStart = DateTime.fromISO(col.date, { zone: timezone }).startOf("day").toMillis();
            const isToday = col.date === todayLocal;
            const d = DateTime.fromISO(col.date).setLocale(locale);
            const nowTop = (nowMinutes - startHour * 60) * (HOUR_PX / 60);
            return (
              <div key={col.key} className="min-w-[140px] flex-1 border-l border-stone-200">
                <div className="sticky top-0 z-10 flex h-16 flex-col items-center justify-center gap-0.5 bg-white px-2">
                  {view === "week" ? (
                    <button onClick={() => nav({ date: col.date, view: "day" })} className="flex flex-col items-center gap-0.5">
                      <span className={`text-[11px] font-medium uppercase ${isToday ? "text-brand-600" : "text-stone-500"}`}>{d.toFormat("ccc")}</span>
                      <span className={`flex size-9 items-center justify-center rounded-full text-[20px] ${isToday ? "bg-brand-600 text-white" : "text-stone-800 hover:bg-stone-100"}`}>{d.day}</span>
                    </button>
                  ) : staff.length > 1 ? (
                    <span className="flex items-center gap-2 text-sm font-medium text-stone-800">
                      <Avatar name={col.title} size={28} color={col.color} />
                      <span className="truncate">{col.title}</span>
                    </span>
                  ) : (
                    <>
                      <span className={`text-[11px] font-medium uppercase ${isToday ? "text-brand-600" : "text-stone-500"}`}>{d.toFormat("ccc")}</span>
                      <span className={`flex size-9 items-center justify-center rounded-full text-[20px] ${isToday ? "bg-brand-600 text-white" : "text-stone-800"}`}>{d.day}</span>
                    </>
                  )}
                </div>
                <div
                  className="relative cursor-pointer bg-stone-100/70"
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
                    <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-stone-200" style={{ top: i * HOUR_PX }} />
                  ))}
                  {(() => {
                    const layout = layoutOverlaps(colAppts);
                    return colAppts.map((a) => {
                    const { col: lane, cols: lanes } = layout.get(a.id) ?? { col: 0, cols: 1 };
                    const top = (minutesOf(a.start_at) - startHour * 60) * (HOUR_PX / 60);
                    const height = Math.max(22, ((Date.parse(a.end_at) - Date.parse(a.start_at)) / 60000) * (HOUR_PX / 60) - 2);
                    const color = staffById.get(a.staff_id)?.color ?? "#1a73e8";
                    return (
                      <button
                        key={a.id}
                        draggable={a.status !== "cancelled"}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/appointment", a.id);
                          e.dataTransfer.setData("text/offset", String(e.clientY - e.currentTarget.getBoundingClientRect().top));
                        }}
                        onClick={() => setSelected(a)}
                        className="absolute overflow-hidden rounded-lg px-2 py-1 text-left text-xs leading-snug ring-1 ring-white transition-shadow hover:z-10 hover:shadow-float"
                        style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 6px)`, ...blockStyle(a.status, color) }}
                      >
                        <div className={`truncate font-medium ${a.status === "cancelled" ? "line-through" : ""}`}>{a.customer?.first_name} {a.customer?.last_name}</div>
                        <div className="truncate opacity-90">{time(a.start_at)} · {a.service?.name}</div>
                        {view === "week" && staff.length > 1 && height > 56 && <div className="truncate opacity-80">{staffById.get(a.staff_id)?.name}</div>}
                        {height > 50 && a.status !== "scheduled" && a.status !== "confirmed" && <div className="mt-0.5 truncate font-medium opacity-90">{t(`status.${a.status}`)}</div>}
                      </button>
                    );
                    });
                  })()}
                  {isToday && nowTop >= 0 && nowTop <= hours.length * HOUR_PX && (
                    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                      <div className="absolute -left-1.5 -top-1.5 size-3 rounded-full bg-[#ea4335]" />
                      <div className="h-0.5 bg-[#ea4335]" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button className="btn-fab fixed bottom-24 right-4 z-30 sm:hidden" onClick={() => setCreating({ date })} aria-label={t("calendar.new_appointment")}>
        <Icon name="add" size={24} />
      </button>

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
      <Link href={`/customers/${appt.customer_id}`} className="flex items-center gap-3 rounded-2xl p-2 -m-2 hover:bg-stone-100">
        <Avatar name={`${appt.customer?.first_name ?? ""} ${appt.customer?.last_name ?? ""}`} size={44} />
        <div className="min-w-0">
          <div className="truncate text-lg font-medium text-stone-900">{appt.customer?.first_name} {appt.customer?.last_name}</div>
          {appt.customer?.phone && <div className="text-sm text-stone-500">{formatPhone(appt.customer.phone)}</div>}
        </div>
      </Link>
      <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-stone-100 p-4 text-sm">
        <div><dt className="text-stone-500">{t("appointment.service")}</dt><dd className="font-medium">{appt.service?.name}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.staff")}</dt><dd className="font-medium">{staff.find((s) => s.id === appt.staff_id)?.name}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.when")}</dt><dd className="font-medium first-letter:uppercase">{dateTime(appt.start_at)}–{time(appt.end_at)}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.price")}</dt><dd className="font-medium">{money(Number(appt.price), appt.currency)}</dd></div>
        <div><dt className="text-stone-500">{t("appointment.status")}</dt><dd><StatusBadge status={appt.status} /></dd></div>
        <div><dt className="text-stone-500">{t("appointment.source")}</dt><dd className="font-medium">{t(`source.${appt.source}` as MessageKey)}</dd></div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {appt.status === "scheduled" && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => onStatus("confirmed")}><Icon name="check" size={16} />{t("appointment.confirm")}</button>}
        {active && <button className="btn-primary btn-sm" disabled={pending} onClick={() => onStatus("completed")}>{t("appointment.complete")}</button>}
        {active && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => onStatus("no_show")}>{t("appointment.no_show")}</button>}
        {active && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => setEditing(!editing)}>{t("appointment.reschedule")}</button>}
        {active && <button className="btn-danger btn-sm" disabled={pending} onClick={() => confirm(t("appointment.cancel_confirm")) && onStatus("cancelled")}>{t("appointment.cancel")}</button>}
        {!active && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => onStatus("scheduled")}>{t("appointment.reopen")}</button>}
        <button className="btn-tonal btn-sm" onClick={onRebook}><Icon name="replay" size={16} />{t("appointment.rebook")}</button>
      </div>

      {appt.status === "completed" && (
        <div className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-900">
          {t("appointment.rebook_prompt")} <button className="font-medium underline" onClick={onRebook}>{t("appointment.schedule_next")}</button>
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-2xl bg-stone-100 p-4">
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
      {error && <p className="text-sm text-bad-700">{error}</p>}
    </div>
  );
}
