"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/Modal";
import { createOwnerAppointment } from "@/app/actions/appointments";
import { addWaitlistEntry, setWaitlistStatus } from "@/app/actions/waitlist";
import { searchCustomers } from "@/app/actions/customers";
import { formatLocalDate, formatWallTime } from "@/lib/i18n/format";
import { whatsappLink } from "@/lib/phone";
import type { FormService, FormStaff, PickerCustomer } from "@/components/AppointmentForm";
import type { MessageKey } from "@/lib/i18n";
import type { WaitlistEntry } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";

export type WaitlistRow = WaitlistEntry & {
  customer: { id: string; first_name: string; last_name: string | null; phone: string | null } | null;
  service: { name: string } | null;
  staff: { name: string } | null;
  matches: { start: string; staffIds: string[] }[];
  expired: boolean;
};

export function WaitlistView({ rows, services, staff, businessName }: { rows: WaitlistRow[]; services: FormService[]; staff: FormStaff[]; businessName: string }) {
  const { t, locale, date, time } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(t(r.error as MessageKey));
      router.refresh();
    });

  const withMatches = rows.filter((r) => r.matches.length);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="h1 mr-auto">{t("nav.waitlist")}</h1>
        <button className="btn-primary btn-sm" onClick={() => setAdding(true)} disabled={!services.length}><Icon name="add" size={16} />{t("waitlist.add")}</button>
      </div>
      <p className="muted">{t("waitlist.intro")}</p>
      {withMatches.length > 0 && <p className="rounded-2xl bg-ok-100 p-4 text-sm font-medium text-ok-700"><Icon name="sparkle" size={18} className="mr-2 inline" />{t("waitlist.matches_found", { count: withMatches.length })}</p>}
      {error && <p className="rounded-2xl bg-bad-100 p-3 text-sm text-bad-700">{error}</p>}
      {rows.length === 0 && <div className="card muted text-center">{t("waitlist.empty")}</div>}

      {rows.map((r) => {
        const first = r.matches[0];
        const msg = first
          ? t("message.waitlist", { name: r.customer?.first_name ?? "", business: businessName, date: date(first.start), time: time(first.start) })
          : "";
        const wa = first ? whatsappLink(r.customer?.phone, msg) : null;
        return (
          <div key={r.id} className={`card space-y-3 ${r.expired ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start gap-2">
              <Avatar name={`${r.customer?.first_name ?? ""} ${r.customer?.last_name ?? ""}`} size={40} />
              <div className="mr-auto min-w-0">
                <Link href={`/customers/${r.customer_id}`} className="font-medium text-stone-900 hover:underline">{r.customer?.first_name} {r.customer?.last_name}</Link>
                <div className="text-sm text-stone-600">
                  {r.service?.name} · {r.staff?.name ?? t("booking.any_staff")}
                </div>
                <div className="text-sm first-letter:uppercase text-stone-500">
                  {r.preferred_date ? formatLocalDate(r.preferred_date, locale, { weekday: "short", day: "numeric", month: "short" }) : t("waitlist.any_date")}
                  {r.preferred_start_time && ` · ${formatWallTime(r.preferred_start_time, locale)}–${r.preferred_end_time ? formatWallTime(r.preferred_end_time, locale) : ""}`}
                </div>
                {r.notes && <div className="text-xs text-stone-400">{r.notes}</div>}
              </div>
              <div className="flex gap-1">
                {r.status === "contacted" && <span className="chip bg-sky-100 text-sky-800">{t("waitlist.contacted")}</span>}
                {r.source === "booking_page" && <span className="chip bg-brand-50 text-brand-700">{t("source.booking_page")}</span>}
              </div>
            </div>

            {r.expired ? (
              <p className="text-sm text-stone-500">{t("waitlist.expired")}</p>
            ) : r.matches.length ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-ok-700">{t("waitlist.available_now")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.matches.map((m) => (
                    <button
                      key={m.start}
                      disabled={pending}
                      className="h-9 rounded-lg bg-ok-100 px-3 text-sm font-medium text-ok-700 transition hover:brightness-95 first-letter:uppercase"
                      onClick={() =>
                        confirm(t("waitlist.book_confirm", { date: `${date(m.start)} ${time(m.start)}` })) &&
                        run(() => createOwnerAppointment({ customerId: r.customer_id, serviceId: r.service_id, staffId: r.staff_id ?? m.staffIds[0], startAt: m.start, waitlistEntryId: r.id }))
                      }
                    >
                      {date(m.start)} {time(m.start)}
                    </button>
                  ))}
                </div>
                <p className="mt-3 rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">{msg}</p>
              </div>
            ) : (
              <p className="text-sm text-stone-500">{t("waitlist.no_matches")}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {msg && <button className="btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(msg)}><Icon name="copy" size={16} />{t("message.copy")}</button>}
              {wa && <a className="btn-secondary btn-sm" href={wa} target="_blank" rel="noreferrer" onClick={() => run(() => setWaitlistStatus(r.id, "contacted"))}><Icon name="chat" size={16} />{t("message.open_whatsapp")}</a>}
              {r.status === "active" && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setWaitlistStatus(r.id, "contacted"))}>{t("waitlist.mark_contacted")}</button>}
              <button className="btn-ghost btn-sm text-bad-700 hover:bg-bad-100" disabled={pending} onClick={() => run(() => setWaitlistStatus(r.id, "cancelled"))}>{t("waitlist.remove")}</button>
            </div>
          </div>
        );
      })}

      <Modal open={adding} onClose={() => setAdding(false)} title={t("waitlist.add")}>
        {adding && <WaitlistForm services={services} staff={staff} onDone={() => { setAdding(false); router.refresh(); }} />}
      </Modal>
    </div>
  );
}

function WaitlistForm({ services, staff, onDone }: { services: FormService[]; staff: FormStaff[]; onDone: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerCustomer[]>([]);
  const [customer, setCustomer] = useState<PickerCustomer | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      action={(f) =>
        start(async () => {
          const r = await addWaitlistEntry({
            customerId: customer?.id ?? null,
            newCustomer: customer ? null : q.trim() ? { first_name: q.trim().split(" ")[0], last_name: q.trim().split(" ").slice(1).join(" "), phone: String(f.get("phone") ?? "") } : null,
            serviceId: String(f.get("service")),
            staffId: String(f.get("staff") || "") || null,
            preferredDate: String(f.get("date") || "") || null,
            preferredStart: String(f.get("from") || "") || null,
            preferredEnd: String(f.get("to") || "") || null,
            notes: String(f.get("notes") ?? ""),
          });
          if (!r.ok) return setError(t(r.error as MessageKey));
          onDone();
        })
      }
    >
      <div>
        <label className="label">{t("appointment.customer")}</label>
        {customer ? (
          <div className="flex items-center justify-between rounded-2xl border border-stone-200 px-3 py-2">
            <span className="font-medium">{customer.first_name} {customer.last_name}</span>
            <button type="button" className="text-sm text-brand-600" onClick={() => setCustomer(null)}>{t("common.change")}</button>
          </div>
        ) : (
          <>
            <input
              className="input"
              placeholder={t("waitlist.customer_placeholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                searchCustomers(e.target.value).then((r) => r.ok && setResults(r.data.slice(0, 5)));
              }}
            />
            {results.length > 0 && q && (
              <ul className="mt-1 divide-y divide-stone-100 rounded-2xl border border-stone-200">
                {results.map((c) => (
                  <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => setCustomer(c)}>{c.first_name} {c.last_name}</button></li>
                ))}
              </ul>
            )}
            <input className="input mt-2" name="phone" type="tel" placeholder={t("customer.phone")} />
          </>
        )}
      </div>
      <select className="input" name="service">{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      {staff.length > 1 && (
        <select className="input" name="staff">
          <option value="">{t("booking.any_staff")}</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div>
        <label className="label">{t("waitlist.preferred_date")}</label>
        <input className="input" type="date" name="date" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">{t("waitlist.from")}</label><input className="input" type="time" name="from" /></div>
        <div><label className="label">{t("waitlist.to")}</label><input className="input" type="time" name="to" /></div>
      </div>
      <textarea className="input" name="notes" rows={2} placeholder={t("appointment.notes")} />
      {error && <p className="text-sm text-bad-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</button>
    </form>
  );
}
