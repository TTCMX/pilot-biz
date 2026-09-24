import { describe, expect, it } from "vitest";
import { getAvailableSlots, getCapacity, isSlotAvailable, subtractIntervals, type AvailabilityRule } from "./engine";

const tz = "America/Mexico_City";
const weekday = (d: number, start = "09:00", end = "13:00", staff_id = "ana"): AvailabilityRule => ({ staff_id, day_of_week: d, start_time: start, end_time: end });
const now = new Date("2026-01-01T00:00:00Z");

describe("booking engine", () => {
  it("generates slots inside working hours", () => {
    // 2026-09-28 is a Monday
    const slots = getAvailableSlots({ timezone: tz, date: "2026-09-28", durationMinutes: 60, staffIds: ["ana"], rules: [weekday(1)], exceptions: [], busy: [], slotIntervalMinutes: 60, now });
    expect(slots.map((s) => s.start)).toEqual([
      "2026-09-28T15:00:00.000Z",
      "2026-09-28T16:00:00.000Z",
      "2026-09-28T17:00:00.000Z",
      "2026-09-28T18:00:00.000Z",
    ]);
  });

  it("removes appointments and respects buffers", () => {
    const slots = getAvailableSlots({
      timezone: tz, date: "2026-09-28", durationMinutes: 60, bufferMinutes: 15, staffIds: ["ana"], rules: [weekday(1)], exceptions: [],
      busy: [{ staff_id: "ana", start_at: "2026-09-28T16:00:00Z", end_at: "2026-09-28T17:00:00Z" }],
      slotIntervalMinutes: 15, now,
    });
    const starts = slots.map((s) => s.start.slice(11, 16));
    expect(starts[0]).toBe("17:00"); // 15:00 + 60 + 15 buffer overlaps 16:00
    expect(starts).not.toContain("15:15"); // 15:15 + 60 + 15 buffer > 16:00
    expect(starts).toContain("17:00");
    expect(starts.at(-1)).toBe("17:45"); // 17:45 + 75 = 19:00 (13:00 local)
  });

  it("handles full-day and partial time off, business holidays and custom hours", () => {
    const base = { timezone: tz, durationMinutes: 60, staffIds: ["ana"], rules: [weekday(1)], busy: [], slotIntervalMinutes: 60, now };
    expect(getAvailableSlots({ ...base, date: "2026-09-28", exceptions: [{ staff_id: "ana", date: "2026-09-28", start_time: null, end_time: null, type: "time_off" }] })).toHaveLength(0);
    expect(getAvailableSlots({ ...base, date: "2026-09-28", exceptions: [{ staff_id: null, date: "2026-09-28", start_time: null, end_time: null, type: "time_off" }] })).toHaveLength(0);
    expect(getAvailableSlots({ ...base, date: "2026-09-28", exceptions: [{ staff_id: "ana", date: "2026-09-28", start_time: "10:00", end_time: "12:00", type: "time_off" }] })).toHaveLength(2);
    // Sunday normally closed, custom hours open it
    const sunday = getAvailableSlots({ ...base, date: "2026-09-27", exceptions: [{ staff_id: "ana", date: "2026-09-27", start_time: "10:00", end_time: "12:00", type: "custom_hours" }] });
    expect(sunday).toHaveLength(2);
  });

  it("is correct across DST changes", () => {
    // New York switches to DST on 2026-03-08: 09:00 local is 13:00Z (not 14:00Z)
    const ny = "America/New_York";
    const before = getAvailableSlots({ timezone: ny, date: "2026-03-07", durationMinutes: 60, staffIds: ["a"], rules: [weekday(6, "09:00", "10:00", "a")], exceptions: [], busy: [], now });
    const after = getAvailableSlots({ timezone: ny, date: "2026-03-09", durationMinutes: 60, staffIds: ["a"], rules: [weekday(1, "09:00", "10:00", "a")], exceptions: [], busy: [], now });
    expect(before[0].start).toBe("2026-03-07T14:00:00.000Z");
    expect(after[0].start).toBe("2026-03-09T13:00:00.000Z");
  });

  it("merges staff and applies min notice", () => {
    const slots = getAvailableSlots({
      timezone: tz, date: "2026-09-28", durationMinutes: 60, staffIds: ["ana", "sofi"],
      rules: [weekday(1), weekday(1, "12:00", "14:00", "sofi")], exceptions: [], busy: [], slotIntervalMinutes: 60,
      now: new Date("2026-09-28T15:30:00Z"), minNoticeMinutes: 60,
    });
    expect(slots[0].start).toBe("2026-09-28T17:00:00.000Z");
    const noon = slots.find((s) => s.start === "2026-09-28T18:00:00.000Z");
    expect(noon?.staffIds.sort()).toEqual(["ana", "sofi"]);
    expect(isSlotAvailable({ timezone: tz, date: "2026-09-28", durationMinutes: 60, staffIds: [], staffId: "sofi", startAt: "2026-09-28T19:00:00Z", rules: [weekday(1, "12:00", "14:00", "sofi")], exceptions: [], busy: [], now })).toBe(true);
  });

  it("computes capacity", () => {
    const cap = getCapacity({ timezone: tz, date: "2026-09-28", staffIds: ["ana"], rules: [weekday(1)], exceptions: [], busy: [{ staff_id: "ana", start_at: "2026-09-28T16:00:00Z", end_at: "2026-09-28T17:00:00Z" }] });
    expect(cap).toMatchObject({ availableMinutes: 240, bookedMinutes: 60, freeMinutes: 180, utilization: 0.25 });
  });

  it("subtracts intervals", () => {
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 2, end: 4 }, { start: 8, end: 12 }])).toEqual([{ start: 0, end: 2 }, { start: 4, end: 8 }]);
  });
});
