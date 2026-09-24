import { describe, expect, it } from "vitest";
import { averageIntervalDays, segmentContext, segmentsOf } from "./customers";
import { periodBounds, revenueSummary } from "./revenue";
import { DateTime } from "luxon";

const stats = (visit_count: number, total_spend: number, last_visit: string | null, next: string | null = null) => ({
  customer_id: "x", visit_count, total_spend, average_ticket: 0, first_visit: last_visit, last_visit, next_appointment: next, cancellation_count: 0, no_show_count: 0,
});

describe("customer metrics", () => {
  it("computes average interval", () => {
    expect(averageIntervalDays(["2026-01-01", "2026-01-29", "2026-02-26"])).toBe(28);
    expect(averageIntervalDays(["2026-01-01"])).toBeNull();
  });

  it("segments customers", () => {
    const now = Date.parse("2026-09-24T00:00:00Z");
    const list = [
      { id: "a", created_at: "2026-09-20T00:00:00Z", stats: stats(0, 0, null) },
      { id: "b", created_at: "2025-01-01T00:00:00Z", stats: stats(12, 8400, "2026-09-21T00:00:00Z") },
      { id: "c", created_at: "2025-01-01T00:00:00Z", stats: stats(3, 900, "2026-03-01T00:00:00Z") },
    ];
    const ctx = segmentContext(list, now);
    expect(segmentsOf(list[0], ctx)).toContain("new");
    expect(segmentsOf(list[1], ctx)).toEqual(expect.arrayContaining(["recurring", "vip"]));
    expect(segmentsOf(list[2], ctx)).toEqual(expect.arrayContaining(["recurring", "inactive"]));
    expect(segmentsOf(list[2], ctx)).not.toContain("vip");
  });
});

describe("revenue", () => {
  it("separates booked and completed", () => {
    const bounds = periodBounds("today", "America/Mexico_City", 1, DateTime.fromISO("2026-09-24T12:00:00", { zone: "America/Mexico_City" }) as DateTime<true>);
    const r = revenueSummary(
      [
        { start_at: "2026-09-24T16:00:00Z", status: "completed", price: 700 },
        { start_at: "2026-09-24T22:00:00Z", status: "confirmed", price: "500" },
        { start_at: "2026-09-24T23:00:00Z", status: "cancelled", price: 900 },
        { start_at: "2026-09-25T16:00:00Z", status: "scheduled", price: 300 },
      ],
      bounds,
    );
    expect(r).toEqual({ booked: 500, completed: 700, total: 1200, count: 2 });
  });
});
