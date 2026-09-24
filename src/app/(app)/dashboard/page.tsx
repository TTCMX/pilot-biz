import Link from "next/link";
import { DateTime } from "luxon";
import { requireBusiness, getProfile } from "@/lib/context";
import { createT } from "@/lib/i18n";
import { dayBounds, formatDate, formatMoney, formatTime, localDateOf, todayIn } from "@/lib/i18n/format";
import { loadBookingData } from "@/lib/booking/service";
import { openSpots, typicalDuration } from "@/lib/metrics/capacity";
import { periodBounds, revenueSummary, type Period } from "@/lib/metrics/revenue";
import { customerName, type AppointmentStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Dashboard" };

type Row = {
  id: string; start_at: string; end_at: string; status: AppointmentStatus; price: number; currency: string; source: string; created_at: string;
  customer: { id: string; first_name: string; last_name: string | null } | null;
  service: { name: string } | null;
  staff: { name: string } | null;
};

export default async function DashboardPage() {
  const { business, supabase } = await requireBusiness();
  const profile = await getProfile();
  const t = createT(business.language);
  const f = { locale: business.locale, timezone: business.timezone };
  const money = (n: number) => formatMoney(n, business.currency, business.locale);
  const today = todayIn(business.timezone);
  const now = DateTime.now().setZone(business.timezone);

  const periods: Period[] = ["today", "week", "month"];
  const bounds = Object.fromEntries(periods.map((p) => [p, periodBounds(p, business.timezone, business.week_start)])) as Record<Period, { start: string; end: string }>;
  const rangeStart = [bounds.week.start, bounds.month.start].sort()[0];
  const rangeEnd = [bounds.week.end, bounds.month.end].sort().at(-1)!;
  const todayRange = dayBounds(today, business.timezone);

  const [appts, recent, waitlist, bookingData] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, start_at, end_at, status, price, currency, source, created_at, customer:customers(id, first_name, last_name), service:services(name), staff:staff(name)")
      .eq("business_id", business.id)
      .gte("start_at", rangeStart)
      .lt("start_at", rangeEnd)
      .order("start_at"),
    supabase
      .from("appointments")
      .select("id, start_at, end_at, status, price, currency, source, created_at, customer:customers(id, first_name, last_name), service:services(name), staff:staff(name)")
      .eq("business_id", business.id)
      .eq("source", "booking_page")
      .gte("created_at", now.minus({ hours: 48 }).toUTC().toISO()!)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("status", "active"),
    loadBookingData(supabase, business, today, today),
  ]);

  const rows = (appts.data ?? []) as unknown as Row[];
  const todays = rows.filter((a) => a.start_at >= todayRange.start && a.start_at < todayRange.end);
  const activeToday = todays.filter((a) => a.status !== "cancelled");
  const cancelledToday = todays.filter((a) => a.status === "cancelled").length;
  const bookedToday = activeToday.reduce((s, a) => s + Number(a.price), 0);
  const spots = openSpots(bookingData, business.timezone, today);
  const nowIso = new Date().toISOString();
  let next = rows.find((a) => a.end_at > nowIso && (a.status === "scheduled" || a.status === "confirmed"));
  if (!next) {
    const { data } = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, price, currency, source, created_at, customer:customers(id, first_name, last_name), service:services(name), staff:staff(name)")
      .eq("business_id", business.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("start_at", nowIso)
      .order("start_at")
      .limit(1)
      .maybeSingle();
    next = (data as unknown as Row) ?? undefined;
  }
  const revenue = Object.fromEntries(periods.map((p) => [p, revenueSummary(rows, bounds[p])]));
  const hour = now.hour;
  const greeting = hour < 12 ? t("dashboard.good_morning") : hour < 19 ? t("dashboard.good_afternoon") : t("dashboard.good_evening");
  const firstName = (profile?.name ?? "").split(" ")[0];
  const newBookings = (recent.data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="h1">{greeting}{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="muted first-letter:uppercase">{formatDate(nowIso, f, { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>

      {newBookings.length > 0 && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <h2 className="font-semibold text-green-900">🎉 {t("dashboard.new_bookings", { count: newBookings.length })}</h2>
          <ul className="mt-2 space-y-1 text-sm text-green-900">
            {newBookings.map((b) => (
              <li key={b.id}>
                <Link href={`/customers/${b.customer?.id}`} className="font-medium underline-offset-2 hover:underline">{customerName(b.customer)}</Link>
                {" · "}{b.service?.name}{" · "}{formatDate(b.start_at, f)} {formatTime(b.start_at, f)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="h2 mb-3">{t("dashboard.today")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("dashboard.appointments")} value={String(activeToday.length)} href="/calendar" />
          <Stat label={t("dashboard.booked_today")} value={money(bookedToday)} />
          <Stat label={t("dashboard.open_spots")} value={String(spots)} hint={t("dashboard.open_spots_hint", { minutes: typicalDuration(bookingData) })} href="/calendar" />
          <Stat label={t("dashboard.cancellations")} value={String(cancelledToday)} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="h2 mb-3">{t("dashboard.next_appointment")}</h2>
          {next ? (
            <Link href={`/calendar?date=${localDateOf(next.start_at, business.timezone)}`} className="block rounded-xl bg-brand-50 p-4 hover:bg-brand-100">
              <div className="text-lg font-semibold">{customerName(next.customer)}</div>
              <div className="text-stone-700">{next.service?.name}</div>
              <div className="mt-1 text-sm text-stone-600">
                {localDateOf(next.start_at, business.timezone) !== today && `${formatDate(next.start_at, f)} · `}
                {formatTime(next.start_at, f)}–{formatTime(next.end_at, f)} · {next.staff?.name}
              </div>
            </Link>
          ) : (
            <p className="muted">{t("dashboard.no_upcoming")}</p>
          )}
          <h3 className="mb-2 mt-5 text-sm font-semibold text-stone-600">{t("dashboard.todays_schedule")}</h3>
          {activeToday.length ? (
            <ul className="divide-y divide-stone-100">
              {activeToday.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="w-20 shrink-0 font-medium tabular-nums">{formatTime(a.start_at, f)}</span>
                  <span className="min-w-0 flex-1 truncate">{customerName(a.customer)} · {a.service?.name}</span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("dashboard.empty_today")}</p>
          )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <h2 className="h2 mb-3">{t("dashboard.quick_actions")}</h2>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/calendar?new=1" className="btn-primary">+ {t("dashboard.new_appointment")}</Link>
              <Link href="/customers?new=1" className="btn-secondary">+ {t("dashboard.new_customer")}</Link>
              <Link href="/calendar" className="btn-secondary">{t("dashboard.view_calendar")}</Link>
              <Link href="/customers" className="btn-secondary">{t("dashboard.view_customers")}</Link>
            </div>
            {(waitlist.count ?? 0) > 0 && (
              <Link href="/waitlist" className="mt-3 block rounded-xl bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100">
                ⏳ {t("dashboard.waitlist_count", { count: waitlist.count ?? 0 })}
              </Link>
            )}
          </section>

          <section className="card">
            <h2 className="h2 mb-3">{t("dashboard.revenue")}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="pb-2 font-medium"></th>
                  <th className="pb-2 text-right font-medium">{t("revenue.booked")}</th>
                  <th className="pb-2 text-right font-medium">{t("revenue.completed")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {periods.map((p) => (
                  <tr key={p}>
                    <td className="py-2 font-medium">{t(`revenue.${p}`)}</td>
                    <td className="py-2 text-right tabular-nums">{money(revenue[p].booked)}</td>
                    <td className="py-2 text-right tabular-nums">{money(revenue[p].completed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-stone-500">{t("revenue.explanation")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <div className="text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
      <div className="mt-1 text-sm text-stone-600">{label}</div>
      {hint && <div className="text-xs text-stone-400">{hint}</div>}
    </>
  );
  return href ? <Link href={href} className="card block hover:border-brand-200">{body}</Link> : <div className="card">{body}</div>;
}
