import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bundleFor, eligibleStaff, slotsFor, type BookingData } from "./service";

const service = (id: string, duration: number, price: number, buffer = 0) =>
  ({ id, business_id: "b", name: id, description: null, duration_minutes: duration, buffer_minutes: buffer, price, currency: "MXN", category: null, active: true, sort_order: 0 }) as never;

const data: BookingData = {
  staff: [{ id: "ana" }, { id: "sofia" }] as never,
  services: [service("mani", 45, 300), service("pedi", 60, 400, 15), service("gel", 60, 500)],
  staffServices: [
    { staff_id: "ana", service_id: "gel" }, // only Ana does gel
  ],
  rules: [1, 2, 3, 4, 5, 6, 7].flatMap((d) => ["ana", "sofia"].map((s) => ({ staff_id: s, day_of_week: d, start_time: "09:00", end_time: "12:00" }))) as never,
  exceptions: [],
  busy: [],
};

describe("multi-service bookings", () => {
  it("adds up durations and prices and keeps the largest buffer", () => {
    const b = bundleFor(data, ["mani", "pedi"])!;
    expect(b.durationMinutes).toBe(105);
    expect(b.price).toBe(700);
    expect(b.bufferMinutes).toBe(15);
    expect(b.primary.id).toBe("pedi");
    expect(b.label).toBe("mani + pedi");
  });

  it("uses no label for a single service and rejects unknown or too many services", () => {
    expect(bundleFor(data, "mani")!.label).toBeNull();
    expect(bundleFor(data, ["mani", "nope"])).toBeNull();
    expect(bundleFor(data, Array(6).fill("mani"))!.services).toHaveLength(1); // duplicates collapse
  });

  it("only offers staff who can do every selected service", () => {
    expect(eligibleStaff(data, ["mani", "pedi"])).toEqual(["ana", "sofia"]);
    expect(eligibleStaff(data, ["mani", "gel"])).toEqual(["ana"]);
  });

  it("offers slots only where the whole combined time fits", () => {
    const business = { timezone: "UTC", slot_interval_minutes: 15, min_notice_minutes: 0, max_advance_days: 365 };
    const now = new Date("2030-01-01T00:00:00Z");
    // 09:00–12:00 window, 105 min + 15 min buffer → last start 10:00
    const slots = slotsFor(data, business, ["mani", "pedi"], "ana", "2030-01-07", { now, ownerMode: true });
    expect(slots.at(-1)!.start).toBe("2030-01-07T10:00:00.000Z");
    expect(slots.at(-1)!.end).toBe("2030-01-07T11:45:00.000Z");
  });
});
