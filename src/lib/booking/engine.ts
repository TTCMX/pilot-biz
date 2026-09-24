// Booking engine: pure, deterministic, UI-independent.
//
//   Working hours − existing appointments − blocked periods = available slots
//
// All inputs are plain data so the same engine powers the public booking page,
// the owner calendar, rebooking, the waitlist and future capacity analytics.
// Local times (HH:mm) are interpreted in the business timezone; DST is handled
// by Luxon, and all outputs are absolute UTC instants (ISO strings).

import { DateTime } from "luxon";

export type AvailabilityRule = {
  staff_id: string;
  day_of_week: number; // ISO: 1 = Monday … 7 = Sunday
  start_time: string; // "HH:mm" or "HH:mm:ss"
  end_time: string;
};

export type AvailabilityException = {
  staff_id: string | null; // null = whole business
  date: string; // "YYYY-MM-DD"
  start_time: string | null;
  end_time: string | null;
  type: "time_off" | "custom_hours";
};

export type BusyInterval = {
  staff_id: string;
  start_at: string; // ISO instant
  end_at: string; // ISO instant (already includes any buffer)
};

export type Interval = { start: number; end: number }; // epoch ms, [start, end)

export type Slot = {
  start: string; // ISO UTC
  end: string; // ISO UTC (service duration only)
  staffIds: string[]; // staff members free for this slot
};

export type SlotQuery = {
  timezone: string;
  date: string; // local "YYYY-MM-DD"
  durationMinutes: number;
  bufferMinutes?: number;
  staffIds: string[]; // eligible staff (already filtered by service + preference)
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busy: BusyInterval[];
  slotIntervalMinutes?: number;
  now?: Date;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
};

const MINUTE = 60_000;

function toLocal(date: string, time: string, zone: string): DateTime {
  const hhmm = time.slice(0, 5);
  // "24:00" is a valid end-of-day marker.
  if (hhmm === "24:00") return DateTime.fromISO(date, { zone }).plus({ days: 1 }).startOf("day");
  return DateTime.fromISO(`${date}T${hhmm}`, { zone });
}

function localRange(date: string, start: string, end: string, zone: string): Interval | null {
  const s = toLocal(date, start, zone);
  const e = toLocal(date, end, zone);
  if (!s.isValid || !e.isValid || e <= s) return null;
  return { start: s.toMillis(), end: e.toMillis() };
}

/** Merge overlapping/adjacent intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** base − blocks */
export function subtractIntervals(base: Interval[], blocks: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const b of mergeIntervals(blocks)) {
    const next: Interval[] = [];
    for (const r of result) {
      if (b.end <= r.start || b.start >= r.end) {
        next.push(r);
        continue;
      }
      if (b.start > r.start) next.push({ start: r.start, end: b.start });
      if (b.end < r.end) next.push({ start: b.end, end: r.end });
    }
    result = next;
  }
  return result;
}

export function totalMinutes(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start) / MINUTE, 0);
}

/** Working intervals of one staff member for one local date (before appointments). */
export function getWorkingIntervals(
  staffId: string,
  date: string,
  timezone: string,
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
): Interval[] {
  const day = DateTime.fromISO(date, { zone: timezone });
  if (!day.isValid) return [];
  const dayExceptions = exceptions.filter((e) => e.date === date && (e.staff_id === null || e.staff_id === staffId));

  // A full-day time off (staff or business-wide) closes the day.
  if (dayExceptions.some((e) => e.type === "time_off" && !e.start_time)) return [];

  const custom = dayExceptions.filter((e) => e.type === "custom_hours" && e.start_time && e.end_time);
  const source = custom.length
    ? custom.map((e) => ({ start_time: e.start_time!, end_time: e.end_time! }))
    : rules.filter((r) => r.staff_id === staffId && r.day_of_week === day.weekday);

  const working = mergeIntervals(
    source.map((r) => localRange(date, r.start_time, r.end_time, timezone)).filter((i): i is Interval => !!i),
  );

  const blocked = dayExceptions
    .filter((e) => e.type === "time_off" && e.start_time && e.end_time)
    .map((e) => localRange(date, e.start_time!, e.end_time!, timezone))
    .filter((i): i is Interval => !!i);

  return subtractIntervals(working, blocked);
}

function busyFor(staffId: string, busy: BusyInterval[]): Interval[] {
  return busy
    .filter((b) => b.staff_id === staffId)
    .map((b) => ({ start: Date.parse(b.start_at), end: Date.parse(b.end_at) }));
}

/** Free intervals of one staff member on a date (working − busy). */
export function getFreeIntervals(
  staffId: string,
  q: Pick<SlotQuery, "date" | "timezone" | "rules" | "exceptions" | "busy">,
): Interval[] {
  return subtractIntervals(getWorkingIntervals(staffId, q.date, q.timezone, q.rules, q.exceptions), busyFor(staffId, q.busy));
}

/** Available start times for a service on a local date. */
export function getAvailableSlots(q: SlotQuery): Slot[] {
  const interval = Math.max(5, q.slotIntervalMinutes ?? 15) * MINUTE;
  const duration = q.durationMinutes * MINUTE;
  const occupied = duration + (q.bufferMinutes ?? 0) * MINUTE;
  const now = (q.now ?? new Date()).getTime();
  const earliest = now + (q.minNoticeMinutes ?? 0) * MINUTE;
  const latest = q.maxAdvanceDays ? now + q.maxAdvanceDays * 24 * 60 * MINUTE : Infinity;
  const dayStart = DateTime.fromISO(q.date, { zone: q.timezone }).startOf("day").toMillis();

  const byStart = new Map<number, string[]>();
  for (const staffId of q.staffIds) {
    for (const free of getFreeIntervals(staffId, q)) {
      // Align slots to the grid of the local day (e.g. :00, :15, :30, :45).
      let t = dayStart + Math.ceil((free.start - dayStart) / interval) * interval;
      for (; t + occupied <= free.end; t += interval) {
        if (t < earliest || t > latest) continue;
        const list = byStart.get(t) ?? [];
        list.push(staffId);
        byStart.set(t, list);
      }
    }
  }

  return [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, staffIds]) => ({
      start: new Date(t).toISOString(),
      end: new Date(t + duration).toISOString(),
      staffIds,
    }));
}

/** Is a specific start time bookable for a specific staff member? */
export function isSlotAvailable(q: SlotQuery & { staffId: string; startAt: string }): boolean {
  const target = Date.parse(q.startAt);
  return getAvailableSlots({ ...q, staffIds: [q.staffId] }).some((s) => Date.parse(s.start) === target);
}

/** Pick a staff member for an "any professional" booking: the least booked that day. */
export function pickStaff(slot: Slot, busy: BusyInterval[]): string {
  const load = (id: string) => busyFor(id, busy).reduce((m, i) => m + (i.end - i.start), 0);
  return [...slot.staffIds].sort((a, b) => load(a) - load(b))[0];
}

/** Local date strings for a range, inclusive. */
export function dateRange(from: string, days: number, timezone: string): string[] {
  const start = DateTime.fromISO(from, { zone: timezone });
  return Array.from({ length: days }, (_, i) => start.plus({ days: i }).toISODate()!);
}

/** Capacity for a date: working vs booked minutes across staff. Foundation for Pro analytics. */
export function getCapacity(q: Pick<SlotQuery, "date" | "timezone" | "rules" | "exceptions" | "busy" | "staffIds">) {
  let available = 0;
  let free = 0;
  for (const staffId of q.staffIds) {
    const working = getWorkingIntervals(staffId, q.date, q.timezone, q.rules, q.exceptions);
    available += totalMinutes(working);
    free += totalMinutes(subtractIntervals(working, busyFor(staffId, q.busy)));
  }
  const booked = available - free;
  return { availableMinutes: available, bookedMinutes: booked, freeMinutes: free, utilization: available ? booked / available : 0 };
}
