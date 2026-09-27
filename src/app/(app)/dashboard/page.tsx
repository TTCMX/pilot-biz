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
import { HeroShapes, Icon } from "@/components/Icon";

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

  const nextWhen = next
    ? `${localDateOf(next.start_at, business.timezone) !== today ? `${formatDate(next.start_at, f)} · ` : ""}${formatTime(next.start_at, f)}–${formatTime(next.end_at, f)}`
    : "";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="pb-2 pt-4 md:pt-2">
        <h1 className="font-display text-[36px] font-light leading-[1.05] text-stone-900">
          {greeting}{firstName ? <>, <em>{firstName}</em></> : ""}
        </h1>
        <p className="mt-2 text-sm text-stone-500 first-letter:uppercase">{formatDate(nowIso, f, { weekday: "long", day: "numeric", month: "long" })}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          {/* Hero: the next guest */}
          {next ? (
            <Link href={`/calendar?date=${localDateOf(next.start_at, business.timezone)}`} className="card-hero block transition-colors hover:bg-brand-700">
              <HeroShapes />
              <div className="relative text-sm text-white/80">{t("dashboard.next_appointment")}</div>
              <div className="relative mt-2 max-w-[75%] font-display text-[27px] font-light leading-[1.1]">{customerName(next.customer)}</div>
              <div className="relative mt-3 text-[15px] text-white/90">
                {[next.service?.name, next.staff?.name].filter(Boolean).join(" · ")}
              </div>
              <div className="relative mt-1 flex items-center gap-1.5 text-[15px] font-medium first-letter:uppercase">
                <Icon name="schedule" size={18} />
                {nextWhen}
              </div>
            </Link>
          ) : (
            <div className="card-hero">
              <HeroShapes />
              <div className="relative text-sm text-white/80">{t("dashboard.next_appointment")}</div>
              <p className="relative mt-2 max-w-[75%] font-display text-[22px] font-light leading-snug">{t("dashboard.no_upcoming")}</p>
            </div>
          )}

          {newBookings.length > 0 && (
            <section className="card">
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <span className="size-2 rounded-full bg-gold" />
                {t("dashboard.new_bookings", { count: newBookings.length })}
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {newBookings.map((b) => (
                  <li key={b.id} className="truncate text-stone-700">
                    <Link href={`/customers/${b.customer?.id}`} className="font-semibold text-stone-900 underline-offset-2 hover:underline">{customerName(b.customer)}</Link>
                    {" · "}{b.service?.name}{" · "}{formatDate(b.start_at, f)} {formatTime(b.start_at, f)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="eyebrow mb-3 mt-2">{t("dashboard.for_today")}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={t("dashboard.appointments")} value={String(activeToday.length)} href="/calendar" />
              <Stat label={t("dashboard.booked_today")} value={money(bookedToday)} />
              <Stat label={t("dashboard.open_spots")} value={String(spots)} hint={t("dashboard.open_spots_hint", { minutes: typicalDuration(bookingData) })} href="/calendar" />
              <Stat label={t("dashboard.cancellations")} value={String(cancelledToday)} />
            </div>
          </section>

          <section className="card">
            <h2 className="h2 mb-2">{t("dashboard.todays_schedule")}</h2>
            {activeToday.length ? (
              <ul className="divide-y divide-brand-100">
                {activeToday.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className="w-[4.5rem] shrink-0 whitespace-nowrap font-medium tabular-nums text-stone-900">{formatTime(a.start_at, f)}</span>
                    <span className="min-w-0 flex-1 truncate text-stone-700">{customerName(a.customer)} · {a.service?.name}</span>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted py-2">{t("dashboard.empty_today")}</p>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-2">
          <section className="card">
            <h2 className="h2 mb-4">{t("dashboard.quick_actions")}</h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/calendar?new=1" className="btn-primary md:hidden"><Icon name="add" size={18} />{t("dashboard.new_appointment")}</Link>
              <Link href="/customers?new=1" className="btn-secondary"><Icon name="personAdd" size={18} />{t("dashboard.new_customer")}</Link>
              <Link href="/calendar" className="btn-secondary"><Icon name="calendar" size={18} />{t("dashboard.view_calendar")}</Link>
              <Link href="/customers" className="btn-secondary"><Icon name="group" size={18} />{t("dashboard.view_customers")}</Link>
            </div>
            {(waitlist.count ?? 0) > 0 && (
              <Link href="/waitlist" className="mt-4 flex items-center gap-3 rounded-full bg-brand-100 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-brand-200">
                <Icon name="hourglass" size={18} />
                {t("dashboard.waitlist_count", { count: waitlist.count ?? 0 })}
              </Link>
            )}
          </section>

          {/* Concierge-style card: the public booking page, always open */}
          <a href={`/${business.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-[20px] bg-forest p-5 text-white transition-opacity hover:opacity-95">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-white/75">
                <span className="size-2 rounded-full bg-gold" />
                {t("dashboard.online")}
              </div>
              <div className="mt-1.5 font-display text-[20px] font-light leading-tight">{t("dashboard.booking_page_title")}</div>
              <div className="mt-1 truncate text-sm text-white/75">/{business.slug}</div>
            </div>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-hidden="true">
              <Icon name="openInNew" size={20} />
            </span>
          </a>

          <section className="card">
            <h2 className="h2 mb-3">{t("dashboard.revenue")}</h2>
            <ul className="divide-y divide-brand-100">
              {periods.map((p) => (
                <li key={p} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                  <span className="text-stone-700">{t(`revenue.${p}`)}</span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums text-stone-900">{money(revenue[p].booked)}</span>
                    <span className="text-stone-500"> · {t("revenue.completed").toLowerCase()} {money(revenue[p].completed)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-stone-500">{t("revenue.explanation")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Information card: label on top, the figure below. */
function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <div className="text-sm text-stone-500 first-letter:uppercase">{label}</div>
      <div className="mt-2 font-display text-[28px] font-light leading-none tabular-nums text-stone-900">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-stone-500">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-5 transition-colors hover:bg-brand-100 sm:p-5">{body}</Link>
  ) : (
    <div className="card p-5 sm:p-5">{body}</div>
  );
}
