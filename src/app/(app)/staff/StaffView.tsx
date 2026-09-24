"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/Modal";
import { WeeklyHoursEditor, hoursFromRules } from "@/components/WeeklyHoursEditor";
import { addException, deleteException, saveStaff } from "@/app/actions/catalog";
import { saveWeeklyHours, type WeeklyHours } from "@/app/actions/onboarding";
import { formatLocalDate, formatWallTime, weekdayName } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n";
import type { Staff } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";

type Rule = { staff_id: string; day_of_week: number; start_time: string; end_time: string };
type Exception = { id: string; staff_id: string | null; date: string; start_time: string | null; end_time: string | null; type: "time_off" | "custom_hours"; note: string | null };

export function StaffView({ staff, services, links, rules, exceptions, weekStart }: {
  staff: Staff[]; services: { id: string; name: string }[]; links: { staff_id: string; service_id: string }[]; rules: Rule[]; exceptions: Exception[]; weekStart: number;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [hoursFor, setHoursFor] = useState<Staff | null>(null);
  const [exceptionFor, setExceptionFor] = useState<Staff | "business" | null>(null);
  const [pending, start] = useTransition();

  const summary = (staffId: string) => {
    const r = rules.filter((x) => x.staff_id === staffId).sort((a, b) => a.day_of_week - b.day_of_week);
    if (!r.length) return t("staff.no_hours");
    return r.map((x) => `${weekdayName(x.day_of_week, locale, "short")} ${formatWallTime(x.start_time, locale)}–${formatWallTime(x.end_time, locale)}`).join(" · ");
  };

  const exceptionLabel = (e: Exception) =>
    `${formatLocalDate(e.date, locale, { weekday: "short", day: "numeric", month: "short" })} · ${
      e.type === "custom_hours" ? t("exception.custom_hours") : t("exception.time_off")
    }${e.start_time ? ` ${formatWallTime(e.start_time, locale)}–${formatWallTime(e.end_time!, locale)}` : ` (${t("exception.all_day")})`}${e.note ? ` · ${e.note}` : ""}`;

  const ExceptionList = ({ items }: { items: Exception[] }) =>
    items.length ? (
      <ul className="mt-2 space-y-1">
        {items.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 py-1 pl-3 pr-1 text-sm">
            <span className="first-letter:uppercase">{exceptionLabel(e)}</span>
            <button className="icon-btn size-7 text-stone-500" disabled={pending} onClick={() => start(async () => { await deleteException(e.id); router.refresh(); })} aria-label="delete"><Icon name="close" size={16} /></button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="h1 mr-auto">{t("nav.staff")}</h1>
        <button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="add" size={16} />{t("staff.add")}</button>
      </div>

      {staff.map((s) => (
        <div key={s.id} className={`card space-y-3 ${s.active ? "" : "opacity-60"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={s.name} size={40} color={s.color} />
            <span className="mr-auto font-medium">{s.name} {s.role && <span className="font-normal text-stone-500">· {s.role}</span>}</span>
            <button className="btn-secondary btn-sm" onClick={() => setEditing(s)}>{t("common.edit")}</button>
            <button className="btn-secondary btn-sm" onClick={() => setHoursFor(s)}>{t("staff.hours")}</button>
            <button className="btn-secondary btn-sm" onClick={() => setExceptionFor(s)}>{t("staff.add_exception")}</button>
          </div>
          <p className="text-sm text-stone-600 first-letter:uppercase">{summary(s.id)}</p>
          {services.length > 0 && (
            <p className="text-xs text-stone-500">
              {t("staff.services")}: {links.filter((l) => l.staff_id === s.id).map((l) => services.find((x) => x.id === l.service_id)?.name).filter(Boolean).join(", ") || "—"}
            </p>
          )}
          <ExceptionList items={exceptions.filter((e) => e.staff_id === s.id)} />
        </div>
      ))}

      <div className="card">
        <div className="flex items-center gap-2">
          <h2 className="h2 mr-auto">{t("staff.business_closures")}</h2>
          <button className="btn-secondary btn-sm" onClick={() => setExceptionFor("business")}><Icon name="add" size={16} />{t("staff.add_closure")}</button>
        </div>
        <p className="muted">{t("staff.business_closures_hint")}</p>
        <ExceptionList items={exceptions.filter((e) => e.staff_id === null)} />
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("staff.add") : t("common.edit")}>
        {editing && (
          <StaffForm
            staff={editing === "new" ? null : editing}
            services={services}
            assigned={editing === "new" ? services.map((s) => s.id) : links.filter((l) => l.staff_id === editing.id).map((l) => l.service_id)}
            onDone={() => { setEditing(null); router.refresh(); }}
          />
        )}
      </Modal>

      <Modal open={!!hoursFor} onClose={() => setHoursFor(null)} title={`${t("staff.hours")} · ${hoursFor?.name ?? ""}`}>
        {hoursFor && <HoursForm staffId={hoursFor.id} initial={hoursFromRules(rules.filter((r) => r.staff_id === hoursFor.id))} weekStart={weekStart} onDone={() => { setHoursFor(null); router.refresh(); }} />}
      </Modal>

      <Modal open={!!exceptionFor} onClose={() => setExceptionFor(null)} title={exceptionFor === "business" ? t("staff.add_closure") : `${t("staff.add_exception")} · ${(exceptionFor as Staff | null)?.name ?? ""}`}>
        {exceptionFor && <ExceptionForm staffId={exceptionFor === "business" ? null : exceptionFor.id} onDone={() => { setExceptionFor(null); router.refresh(); }} />}
      </Modal>
    </div>
  );
}

function StaffForm({ staff, services, assigned, onDone }: { staff: Staff | null; services: { id: string; name: string }[]; assigned: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState(assigned);
  return (
    <form
      className="space-y-3"
      action={(f) =>
        start(async () => {
          const res = await saveStaff(
            { name: String(f.get("name")), role: String(f.get("role") ?? ""), email: String(f.get("email") ?? ""), phone: String(f.get("phone") ?? ""), color: String(f.get("color")), active: f.get("active") === "on", serviceIds },
            staff?.id,
          );
          if (!res.ok) return setError(t(res.error as MessageKey));
          onDone();
        })
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="label">{t("staff.name")}</label>
          <input className="input" name="name" defaultValue={staff?.name} required autoFocus />
        </div>
        <div>
          <label className="label">{t("staff.color")}</label>
          <input className="input h-[42px] w-16 p-1" type="color" name="color" defaultValue={staff?.color ?? "#1a73e8"} />
        </div>
      </div>
      <div>
        <label className="label">{t("staff.role")}</label>
        <input className="input" name="role" defaultValue={staff?.role ?? ""} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">{t("customer.email")}</label>
          <input className="input" name="email" type="email" defaultValue={staff?.email ?? ""} />
        </div>
        <div>
          <label className="label">{t("customer.phone")}</label>
          <input className="input" name="phone" type="tel" defaultValue={staff?.phone ?? ""} />
        </div>
      </div>
      {services.length > 0 && (
        <fieldset>
          <legend className="label">{t("staff.services")}</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <label key={s.id} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${serviceIds.includes(s.id) ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}>
                <input type="checkbox" className="accent-brand-600" checked={serviceIds.includes(s.id)} onChange={(e) => setServiceIds(e.target.checked ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" className="accent-brand-600" defaultChecked={staff?.active ?? true} />
        {t("staff.active")}
      </label>
      {error && <p className="text-sm text-bad-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</button>
    </form>
  );
}

function HoursForm({ staffId, initial, weekStart, onDone }: { staffId: string; initial: WeeklyHours; weekStart: number; onDone: () => void }) {
  const { t } = useI18n();
  const [hours, setHours] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <WeeklyHoursEditor value={hours} onChange={setHours} weekStart={weekStart} />
      {error && <p className="text-sm text-bad-700">{error}</p>}
      <button
        className="btn-primary w-full"
        disabled={pending}
        onClick={() => start(async () => { const r = await saveWeeklyHours(hours, staffId); if (!r.ok) setError(t(r.error as MessageKey)); else onDone(); })}
      >
        {pending ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}

function ExceptionForm({ staffId, onDone }: { staffId: string | null; onDone: () => void }) {
  const { t } = useI18n();
  const [type, setType] = useState<"time_off" | "custom_hours">("time_off");
  const [allDay, setAllDay] = useState(true);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      action={(f) =>
        start(async () => {
          const timed = type === "custom_hours" || !allDay;
          const r = await addException({
            staff_id: staffId,
            type,
            date: String(f.get("date")),
            end_date: String(f.get("end_date") || "") || null,
            start_time: timed ? String(f.get("start_time")) : null,
            end_time: timed ? String(f.get("end_time")) : null,
            note: String(f.get("note") ?? ""),
          });
          if (!r.ok) return setError(t(r.error as MessageKey));
          onDone();
        })
      }
    >
      {staffId && (
        <div className="flex h-10 overflow-hidden rounded-full border border-stone-300">
          {(["time_off", "custom_hours"] as const).map((v) => (
            <button type="button" key={v} onClick={() => setType(v)} className={`flex flex-1 items-center justify-center gap-1.5 text-sm font-medium ${type === v ? "bg-nav text-nav-on" : "text-stone-700"}`}>
              {type === v && <Icon name="check" size={16} />}
              {t(`exception.${v}`)}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t("exception.from")}</label>
          <input className="input" type="date" name="date" required />
        </div>
        <div>
          <label className="label">{t("exception.to")}</label>
          <input className="input" type="date" name="end_date" />
        </div>
      </div>
      {type === "time_off" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand-600" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          {t("exception.all_day")}
        </label>
      )}
      {(type === "custom_hours" || !allDay) && (
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="time" name="start_time" defaultValue="10:00" required />
          <input className="input" type="time" name="end_time" defaultValue="14:00" required />
        </div>
      )}
      <div>
        <label className="label">{t("exception.note")}</label>
        <input className="input" name="note" placeholder={t("exception.note_placeholder")} />
      </div>
      {error && <p className="text-sm text-bad-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</button>
    </form>
  );
}
