"use client";

import { useEffect, useState, useTransition } from "react";
import { useI18n } from "@/components/I18nProvider";
import { createOwnerAppointment, getOwnerSlots } from "@/app/actions/appointments";
import { searchCustomers } from "@/app/actions/customers";
import { zonedToUtc, localTimeOf } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n";

export type PickerCustomer = { id: string; first_name: string; last_name: string | null; phone: string | null; email?: string | null };
export type FormService = { id: string; name: string; duration_minutes: number; price: number; currency: string };
export type FormStaff = { id: string; name: string; color: string | null };

export type AppointmentPrefill = {
  customer?: PickerCustomer | null;
  serviceId?: string | null;
  staffId?: string | null;
  date?: string;
  time?: string | null;
  rebookedFromId?: string | null;
  waitlistEntryId?: string | null;
};

export function AppointmentForm({
  services, staff, staffServices, prefill, defaultDate, onDone,
}: {
  services: FormService[];
  staff: FormStaff[];
  staffServices: { staff_id: string; service_id: string }[];
  prefill: AppointmentPrefill;
  defaultDate: string;
  onDone: () => void;
}) {
  const { t, money, timezone, time: fmtTime } = useI18n();
  const [customer, setCustomer] = useState<PickerCustomer | null>(prefill.customer ?? null);
  const [newCustomer, setNewCustomer] = useState<{ first_name: string; last_name: string; phone: string } | null>(null);
  const [serviceId, setServiceId] = useState(prefill.serviceId ?? services[0]?.id ?? "");
  const [staffId, setStaffId] = useState<string>(prefill.staffId ?? (staff.length === 1 ? staff[0].id : ""));
  const [date, setDate] = useState(prefill.date ?? defaultDate);
  const [time, setTime] = useState(prefill.time ?? "");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<{ start: string; staffIds: string[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const assigned = staffServices.filter((ss) => ss.service_id === serviceId).map((ss) => ss.staff_id);
  const eligible = staff.filter((s) => !assigned.length || assigned.includes(s.id));
  const service = services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (!serviceId || !date) return;
    let cancelled = false;
    setSlots(null);
    getOwnerSlots({ serviceId, staffId: staffId || null, date }).then((r) => !cancelled && setSlots(r.ok ? r.data : []));
    return () => {
      cancelled = true;
    };
  }, [serviceId, staffId, date]);

  function submit() {
    setError(null);
    if (!customer && !newCustomer?.first_name.trim()) return setError(t("errors.customer_required"));
    if (!time) return setError(t("errors.time_required"));
    startTransition(async () => {
      const startAt = zonedToUtc(date, time, timezone);
      const slot = slots?.find((s) => s.start === startAt);
      const res = await createOwnerAppointment({
        customerId: customer?.id ?? null,
        newCustomer: customer ? null : newCustomer,
        serviceId,
        staffId: staffId || slot?.staffIds[0] || eligible[0]?.id || null,
        startAt,
        notes,
        rebookedFromId: prefill.rebookedFromId ?? null,
        waitlistEntryId: prefill.waitlistEntryId ?? null,
      });
      if (!res.ok) return setError(t(res.error as MessageKey));
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <CustomerPicker value={customer} onChange={setCustomer} newCustomer={newCustomer} onNewCustomer={setNewCustomer} />

      <div>
        <label className="label">{t("appointment.service")}</label>
        <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min · {money(s.price, s.currency)}</option>
          ))}
        </select>
      </div>

      {staff.length > 1 && (
        <div>
          <label className="label">{t("appointment.staff")}</label>
          <select className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{t("booking.any_staff")}</option>
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("appointment.date")}</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("appointment.time")}</label>
          <input className="input" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-stone-500">{t("appointment.free_slots")}</p>
        {slots === null ? (
          <p className="text-sm text-stone-400">{t("common.loading")}</p>
        ) : slots.length ? (
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {slots.map((s) => {
              const local = localTimeOf(s.start, timezone);
              return (
                <button
                  type="button"
                  key={s.start}
                  onClick={() => setTime(local)}
                  className={`rounded-lg border px-2.5 py-1 text-sm tabular-nums ${time === local ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-200"}`}
                >
                  {fmtTime(s.start)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-stone-400">{t("appointment.no_free_slots")}</p>
        )}
      </div>

      <div>
        <label className="label">{t("appointment.notes")}</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-bad-700">{error}</p>}
      <button className="btn-primary w-full" onClick={submit} disabled={pending || !service}>
        {pending ? t("common.saving") : t("appointment.create")}
      </button>
    </div>
  );
}

function CustomerPicker({ value, onChange, newCustomer, onNewCustomer }: {
  value: PickerCustomer | null;
  onChange: (c: PickerCustomer | null) => void;
  newCustomer: { first_name: string; last_name: string; phone: string } | null;
  onNewCustomer: (c: { first_name: string; last_name: string; phone: string } | null) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerCustomer[]>([]);

  useEffect(() => {
    if (value || newCustomer) return;
    const id = setTimeout(() => searchCustomers(q).then((r) => r.ok && setResults(r.data)), 200);
    return () => clearTimeout(id);
  }, [q, value, newCustomer]);

  if (value) {
    return (
      <div>
        <label className="label">{t("appointment.customer")}</label>
        <div className="flex items-center justify-between rounded-2xl border border-stone-200 px-3 py-2">
          <span className="font-medium">{value.first_name} {value.last_name}</span>
          <button className="text-sm text-brand-600" onClick={() => onChange(null)}>{t("common.change")}</button>
        </div>
      </div>
    );
  }

  if (newCustomer) {
    return (
      <div className="space-y-2 rounded-2xl bg-stone-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("customer.new")}</span>
          <button className="text-sm text-brand-600" onClick={() => onNewCustomer(null)}>{t("common.cancel")}</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder={t("customer.first_name")} value={newCustomer.first_name} onChange={(e) => onNewCustomer({ ...newCustomer, first_name: e.target.value })} autoFocus />
          <input className="input" placeholder={t("customer.last_name")} value={newCustomer.last_name} onChange={(e) => onNewCustomer({ ...newCustomer, last_name: e.target.value })} />
        </div>
        <input className="input" type="tel" placeholder={t("customer.phone")} value={newCustomer.phone} onChange={(e) => onNewCustomer({ ...newCustomer, phone: e.target.value })} />
      </div>
    );
  }

  return (
    <div>
      <label className="label">{t("appointment.customer")}</label>
      <input className="input" placeholder={t("customer.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-1 max-h-40 divide-y divide-stone-100 overflow-y-auto rounded-2xl border border-stone-200">
        <li>
          <button className="w-full px-3 py-2 text-left text-sm font-medium text-brand-600" onClick={() => onNewCustomer({ first_name: q, last_name: "", phone: "" })}>
            {t("customer.new")}{q ? `: ${q}` : ""}
          </button>
        </li>
        {results.map((c) => (
          <li key={c.id}>
            <button className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => onChange(c)}>
              <span>{c.first_name} {c.last_name}</span>
              <span className="truncate text-stone-400">{c.phone}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
