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
import { Icon, type IconName } from "@/components/Icon";

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
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="pt-2">
        <h1 className="h1">{greeting}{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-stone-500 first-letter:uppercase">{formatDate(nowIso, f, { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>

      {newBookings.length > 0 && (
        <section className="flex gap-4 rounded-3xl bg-ok-100 p-5 text-ok-700">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/70">
            <Icon name="eventAvailable" size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="font-medium">{t("dashboard.new_bookings", { count: newBookings.length })}</h2>
            <ul className="mt-1 space-y-0.5 text-sm">
              {newBookings.map((b) => (
                <li key={b.id} className="truncate">
                  <Link href={`/customers/${b.customer?.id}`} className="font-medium underline-offset-2 hover:underline">{customerName(b.customer)}</Link>
                  {" · "}{b.service?.name}{" · "}{formatDate(b.start_at, f)} {formatTime(b.start_at, f)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-stone-500">{t("dashboard.today")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon="calendar" tone="blue" label={t("dashboard.appointments")} value={String(activeToday.length)} href="/calendar" />
          <Stat icon="money" tone="green" label={t("dashboard.booked_today")} value={money(bookedToday)} />
          <Stat icon="eventAvailable" tone="yellow" label={t("dashboard.open_spots")} value={String(spots)} hint={t("dashboard.open_spots_hint", { minutes: typicalDuration(bookingData) })} href="/calendar" />
          <Stat icon="eventBusy" tone="red" label={t("dashboard.cancellations")} value={String(cancelledToday)} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="h2 mb-4">{t("dashboard.next_appointment")}</h2>
          {next ? (
            <Link href={`/calendar?date=${localDateOf(next.start_at, business.timezone)}`} className="flex items-center gap-4 rounded-2xl bg-brand-50 p-4 transition-colors hover:bg-brand-100">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-medium text-white">
                {(next.customer?.first_name ?? "?")[0]}
              </span>
              <div className="min-w-0">
                <div className="truncate text-lg font-medium text-stone-900">{customerName(next.customer)}</div>
                <div className="truncate text-sm text-stone-600">
                  {next.service?.name} · {next.staff?.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-brand-700">
                  <Icon name="schedule" size={16} />
                  {localDateOf(next.start_at, business.timezone) !== today && `${formatDate(next.start_at, f)} · `}
                  {formatTime(next.start_at, f)}–{formatTime(next.end_at, f)}
                </div>
              </div>
            </Link>
          ) : (
            <p className="muted">{t("dashboard.no_upcoming")}</p>
          )}
          <h3 className="mb-1 mt-6 text-sm font-medium text-stone-500">{t("dashboard.todays_schedule")}</h3>
          {activeToday.length ? (
            <ul className="divide-y divide-stone-100">
              {activeToday.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="w-20 shrink-0 font-medium tabular-nums text-stone-900">{formatTime(a.start_at, f)}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-700">{customerName(a.customer)} · {a.service?.name}</span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted py-3">{t("dashboard.empty_today")}</p>
          )}
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="h2 mb-4">{t("dashboard.quick_actions")}</h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/calendar?new=1" icon="add" label={t("dashboard.new_appointment")} primary />
              <QuickAction href="/customers?new=1" icon="personAdd" label={t("dashboard.new_customer")} />
              <QuickAction href="/calendar" icon="calendar" label={t("dashboard.view_calendar")} />
              <QuickAction href="/customers" icon="group" label={t("dashboard.view_customers")} />
            </div>
            {(waitlist.count ?? 0) > 0 && (
              <Link href="/waitlist" className="mt-3 flex items-center gap-3 rounded-2xl bg-warn-100 p-3 text-sm font-medium text-warn-700 hover:brightness-95">
                <Icon name="hourglass" size={20} />
                {t("dashboard.waitlist_count", { count: waitlist.count ?? 0 })}
              </Link>
            )}
          </section>

          <section className="card">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <Icon name="trending" size={18} />
              </span>
              <h2 className="h2">{t("dashboard.revenue")}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="pb-2 font-medium"></th>
                  <th className="pb-2 text-right font-medium">{t("revenue.booked")}</th>
                  <th className="pb-2 text-right font-medium">{t("revenue.completed")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {periods.map((p) => (
                  <tr key={p}>
                    <td className="py-2.5 text-stone-700">{t(`revenue.${p}`)}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-stone-900">{money(revenue[p].booked)}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-ok-700">{money(revenue[p].completed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-stone-500">{t("revenue.explanation")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

const TONES = {
  blue: "bg-brand-100 text-brand-700",
  green: "bg-ok-100 text-ok-700",
  yellow: "bg-warn-100 text-warn-700",
  red: "bg-bad-100 text-bad-700",
} as const;

function Stat({ icon, tone, label, value, hint, href }: { icon: IconName; tone: keyof typeof TONES; label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <span className={`flex size-10 items-center justify-center rounded-full ${TONES[tone]}`}>
        <Icon name={icon} size={22} />
      </span>
      <div className="mt-4 text-[28px] font-normal leading-none tabular-nums text-stone-900">{value}</div>
      <div className="mt-1.5 text-sm text-stone-600">{label}</div>
      {hint && <div className="text-xs text-stone-400">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block transition-shadow hover:shadow-float">{body}</Link>
  ) : (
    <div className="card">{body}</div>
  );
}

function QuickAction({ href, icon, label, primary }: { href: string; icon: IconName; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-start gap-3 rounded-2xl p-4 text-sm font-medium transition-colors ${
        primary ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-stone-100 text-stone-800 hover:bg-stone-200"
      }`}
    >
      <Icon name={icon} size={22} />
      {label}
    </Link>
  );
}
