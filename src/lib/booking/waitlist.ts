import { DateTime } from "luxon";
import { dateRange, type Slot } from "./engine";
import { slotsFor, type BookingData } from "./service";
import type { Business, WaitlistEntry } from "@/lib/types";

/** Free slots matching a waitlist entry's preferences (date + time window + staff). */
export function waitlistMatches(
  data: BookingData,
  business: Pick<Business, "timezone" | "slot_interval_minutes" | "min_notice_minutes" | "max_advance_days">,
  entry: Pick<WaitlistEntry, "service_id" | "staff_id" | "preferred_date" | "preferred_start_time" | "preferred_end_time">,
  opts: { from: string; days: number; limit?: number },
): Slot[] {
  const dates = entry.preferred_date ? [entry.preferred_date] : dateRange(opts.from, opts.days, business.timezone);
  const out: Slot[] = [];
  for (const date of dates) {
    for (const slot of slotsFor(data, business, entry.service_id, entry.staff_id, date)) {
      const local = DateTime.fromISO(slot.start, { zone: "utc" }).setZone(business.timezone).toFormat("HH:mm");
      if (entry.preferred_start_time && local < entry.preferred_start_time.slice(0, 5)) continue;
      if (entry.preferred_end_time && local >= entry.preferred_end_time.slice(0, 5)) continue;
      out.push(slot);
      if (out.length >= (opts.limit ?? 6)) return out;
    }
  }
  return out;
}
