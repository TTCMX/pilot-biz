import { DateTime } from "luxon";
import { requireBusiness } from "@/lib/context";
import { loadBookingData } from "@/lib/booking/service";
import { waitlistMatches } from "@/lib/booking/waitlist";
import { todayIn } from "@/lib/i18n/format";
import type { WaitlistEntry } from "@/lib/types";
import { WaitlistView, type WaitlistRow } from "./WaitlistView";

export const metadata = { title: "Waitlist" };

const HORIZON_DAYS = 14;

export default async function WaitlistPage() {
  const { business, supabase } = await requireBusiness();
  const today = todayIn(business.timezone);

  const { data: entries } = await supabase
    .from("waitlist_entries")
    .select("*, customer:customers(id, first_name, last_name, phone), service:services(name), staff:staff(name)")
    .eq("business_id", business.id)
    .in("status", ["active", "contacted"])
    .order("created_at");

  const list = (entries ?? []) as (WaitlistEntry & Pick<WaitlistRow, "customer" | "service" | "staff">)[];
  const dates = list.map((e) => e.preferred_date).filter((d): d is string => !!d && d >= today);
  const last = [DateTime.fromISO(today).plus({ days: HORIZON_DAYS }).toISODate()!, ...dates].sort().at(-1)!;
  const data = await loadBookingData(supabase, business, today, last);

  const rows: WaitlistRow[] = list.map((e) => ({
    ...e,
    expired: !!e.preferred_date && e.preferred_date < today,
    matches: e.preferred_date && e.preferred_date < today ? [] : waitlistMatches(data, business, e, { from: today, days: HORIZON_DAYS }).map((s) => ({ start: s.start, staffIds: s.staffIds })),
  }));

  return (
    <WaitlistView
      rows={rows}
      services={data.services.map((s) => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price, currency: s.currency }))}
      staff={data.staff.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
      businessName={business.name}
    />
  );
}
