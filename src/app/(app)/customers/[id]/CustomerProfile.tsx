"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/Modal";
import { CustomerForm } from "@/components/CustomerForm";
import { StatusBadge } from "@/components/StatusBadge";
import { deleteCustomer } from "@/app/actions/customers";
import { setAppointmentStatus } from "@/app/actions/appointments";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { localDateOf } from "@/lib/i18n/format";
import type { AppointmentStatus, Customer, CustomerStats } from "@/lib/types";

export type HistoryRow = {
  id: string; start_at: string; end_at: string; status: AppointmentStatus; price: number; currency: string;
  service_id: string; staff_id: string; source: string;
  service: { name: string } | null; staff: { name: string } | null;
};

export function CustomerProfile({ customer, stats, history, intervalDays, daysSinceLast, suggestedDate, rebookHref, businessName, bookingUrl }: {
  customer: Customer; stats: CustomerStats | null; history: HistoryRow[]; intervalDays: number | null; daysSinceLast: number | null;
  suggestedDate: string | null; rebookHref: string; businessName: string; bookingUrl: string;
}) {
  const { t, money, date, time, timezone } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const now = new Date().toISOString();
  const overdue = intervalDays !== null && daysSinceLast !== null && daysSinceLast > intervalDays && !stats?.next_appointment;
  const message = t("message.rebook", { name: customer.first_name, business: businessName });
  const wa = whatsappLink(customer.phone, message);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/customers" className="text-sm text-stone-500">← {t("nav.customers")}</Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h1 className="h1">{customer.first_name} {customer.last_name}</h1>
          <p className="muted">{[formatPhone(customer.phone), customer.email].filter(Boolean).join(" · ")}</p>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>{t("common.edit")}</button>
        <Link href={`/calendar?new=1&customer=${customer.id}`} className="btn-secondary btn-sm">+ {t("dashboard.new_appointment")}</Link>
        <Link href={rebookHref} className="btn-primary btn-sm">↻ {t("customer.schedule_next")}</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("customer.visit_count")} value={String(stats?.visit_count ?? 0)} />
        <Stat label={t("customer.total_spend")} value={money(Number(stats?.total_spend ?? 0))} />
        <Stat label={t("customer.average_ticket")} value={stats?.visit_count ? money(Number(stats.average_ticket)) : "—"} />
        <Stat label={t("customer.frequency")} value={intervalDays ? t("customer.every_days", { days: intervalDays }) : "—"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <div className="text-sm text-stone-500">{t("customer.last_visit")}</div>
          <div className="text-lg font-semibold first-letter:uppercase">{stats?.last_visit ? date(stats.last_visit, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
          {daysSinceLast !== null && <div className="text-xs text-stone-400">{t("customer.days_ago", { days: daysSinceLast })}</div>}
        </div>
        <div className="card">
          <div className="text-sm text-stone-500">{t("customer.next_appointment")}</div>
          <div className="text-lg font-semibold first-letter:uppercase">{stats?.next_appointment ? `${date(stats.next_appointment)} · ${time(stats.next_appointment)}` : "—"}</div>
          {!stats?.next_appointment && suggestedDate && <div className="text-xs text-stone-400">{t("customer.suggested_next", { date: date(suggestedDate) })}</div>}
        </div>
      </div>

      {overdue && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">⏰ {t("customer.overdue", { days: daysSinceLast!, interval: intervalDays! })}</p>
          <p className="mt-2 rounded-xl bg-white p-3 text-sm text-stone-700">{message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => { navigator.clipboard?.writeText(message); setCopied(true); }}>{copied ? t("common.copied") : t("message.copy")}</button>
            {wa && <a className="btn-secondary btn-sm" href={wa} target="_blank" rel="noreferrer">{t("message.open_whatsapp")}</a>}
            <Link className="btn-primary btn-sm" href={rebookHref}>{t("customer.schedule_next")}</Link>
          </div>
        </div>
      )}

      {customer.notes && (
        <div className="card">
          <div className="text-sm text-stone-500">{t("customer.notes")}</div>
          <p className="whitespace-pre-wrap">{customer.notes}</p>
        </div>
      )}

      <section className="card overflow-x-auto p-0">
        <h2 className="h2 px-4 pt-4">{t("customer.history")}</h2>
        {history.length === 0 ? (
          <p className="muted p-4">{t("customer.no_history")}</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead className="border-b border-stone-200 text-left text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("appointment.date")}</th>
                <th className="px-4 py-2 font-medium">{t("appointment.service")}</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">{t("appointment.staff")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("appointment.price")}</th>
                <th className="px-4 py-2 font-medium">{t("appointment.status")}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {history.map((a) => {
                const future = a.start_at > now && (a.status === "scheduled" || a.status === "confirmed");
                return (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-4 py-2 first-letter:uppercase">{date(a.start_at)} <span className="text-stone-400">{time(a.start_at)}</span></td>
                    <td className="px-4 py-2">{a.service?.name}</td>
                    <td className="hidden px-4 py-2 sm:table-cell">{a.staff?.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(Number(a.price), a.currency)}</td>
                    <td className="px-4 py-2"><StatusBadge status={a.status} /></td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {future && (
                        <>
                          <Link className="text-xs font-semibold text-brand-600" href={`/calendar?date=${localDateOf(a.start_at, timezone)}`}>{t("appointment.reschedule")}</Link>
                          <button
                            className="ml-3 text-xs font-semibold text-red-600"
                            disabled={pending}
                            onClick={() => confirm(t("appointment.cancel_confirm")) && start(async () => { await setAppointmentStatus(a.id, "cancelled"); router.refresh(); })}
                          >
                            {t("appointment.cancel")}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="flex justify-between">
        <a className="text-sm text-stone-500 underline" href={bookingUrl} target="_blank" rel="noreferrer">{t("nav.booking_page")}</a>
        <button
          className="text-sm text-red-600"
          disabled={pending}
          onClick={() => confirm(t("customer.delete_confirm")) && start(async () => { const r = await deleteCustomer(customer.id); if (r.ok) router.push("/customers"); })}
        >
          {t("customer.delete")}
        </button>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={t("common.edit")}>
        <CustomerForm customer={customer} onSaved={() => { setEditing(false); router.refresh(); }} />
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-stone-500">{label}</div>
    </div>
  );
}
