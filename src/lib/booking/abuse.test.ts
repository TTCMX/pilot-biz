import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { isRateLimited, LIMITS } = await import("./abuse");

const zero = { ipLastHour: 0, phoneLastDay: 0, phoneUpcoming: 0, waitlistLastDay: 0 };

describe("public booking rate limits", () => {
  it("allows normal customers", () => {
    expect(isRateLimited("booking", zero)).toBe(false);
    expect(isRateLimited("booking", { ...zero, phoneLastDay: LIMITS.phonePerDay - 1, phoneUpcoming: LIMITS.phoneUpcoming - 1 })).toBe(false);
    expect(isRateLimited("waitlist", { ...zero, phoneLastDay: 99 })).toBe(false); // booking counts don't block the waitlist
  });

  it("blocks too many bookings per phone", () => {
    expect(isRateLimited("booking", { ...zero, phoneLastDay: LIMITS.phonePerDay })).toBe(true);
    expect(isRateLimited("booking", { ...zero, phoneUpcoming: LIMITS.phoneUpcoming })).toBe(true);
    expect(isRateLimited("waitlist", { ...zero, waitlistLastDay: LIMITS.waitlistPerDay })).toBe(true);
  });

  it("blocks bursts from one IP, and skips the IP rule when the IP is unknown", () => {
    expect(isRateLimited("booking", { ...zero, ipLastHour: LIMITS.ipPerHour })).toBe(true);
    expect(isRateLimited("waitlist", { ...zero, ipLastHour: LIMITS.ipPerHour })).toBe(true);
    expect(isRateLimited("booking", { ...zero, ipLastHour: null })).toBe(false);
  });
});
