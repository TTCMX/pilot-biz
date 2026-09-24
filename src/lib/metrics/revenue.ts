// Revenue basics: booked (future, active) vs completed. Not accounting.

import { DateTime } from "luxon";
import type { AppointmentStatus } from "@/lib/types";

type Row = { start_at: string; status: AppointmentStatus; price: number | string };

export type Period = "today" | "week" | "month";

export function periodBounds(period: Period, timezone: string, weekStart = 1, now = DateTime.now()) {
  const local = now.setZone(timezone);
  let start = local.startOf("day");
  let end = start.plus({ days: 1 });
  if (period === "week") {
    const offset = (local.weekday - weekStart + 7) % 7;
    start = local.startOf("day").minus({ days: offset });
    end = start.plus({ days: 7 });
  } else if (period === "month") {
    start = local.startOf("month");
    end = start.plus({ months: 1 });
  }
  return { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
}

export function revenueSummary(rows: Row[], bounds: { start: string; end: string }) {
  const s = Date.parse(bounds.start);
  const e = Date.parse(bounds.end);
  let booked = 0;
  let completed = 0;
  let count = 0;
  for (const r of rows) {
    const t = Date.parse(r.start_at);
    if (t < s || t >= e) continue;
    const price = Number(r.price);
    if (r.status === "scheduled" || r.status === "confirmed") {
      booked += price;
      count++;
    } else if (r.status === "completed") {
      completed += price;
      count++;
    }
  }
  return { booked, completed, total: booked + completed, count };
}
