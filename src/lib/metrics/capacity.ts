// Remaining bookable capacity, expressed as "open spots" of a typical service length.

import { getFreeIntervals, type Interval } from "@/lib/booking/engine";
import type { BookingData } from "@/lib/booking/service";

export function typicalDuration(data: BookingData): number {
  const durations = data.services.map((s) => s.duration_minutes).sort((a, b) => a - b);
  return durations.length ? durations[Math.floor(durations.length / 2)] : 60;
}

export function openSpots(data: BookingData, timezone: string, date: string, now = Date.now(), duration = typicalDuration(data)): number {
  let spots = 0;
  for (const staff of data.staff) {
    const free: Interval[] = getFreeIntervals(staff.id, { date, timezone, rules: data.rules, exceptions: data.exceptions, busy: data.busy });
    for (const i of free) {
      const start = Math.max(i.start, now);
      if (i.end > start) spots += Math.floor((i.end - start) / (duration * 60_000));
    }
  }
  return spots;
}
