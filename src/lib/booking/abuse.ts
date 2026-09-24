import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Anti-spam for the public booking page. Limits are counted from data the app
// already stores (appointments, waitlist and audit_log), so it works across
// serverless instances without extra infrastructure or schema changes.
// IPs are never stored raw: only a salted hash goes into the audit log.

export const LIMITS = {
  /** Booking-page actions (bookings + waitlist sign-ups) per IP, per business, per hour. */
  ipPerHour: 10,
  /** New online bookings per phone, per business, in 24 hours. */
  phonePerDay: 3,
  /** Upcoming online bookings a single phone can hold at a business. */
  phoneUpcoming: 5,
  /** Waitlist sign-ups per phone, per business, in 24 hours. */
  waitlistPerDay: 3,
} as const;

export type AbuseCounts = { ipLastHour: number | null; phoneLastDay: number; phoneUpcoming: number; waitlistLastDay: number };

/** Pure decision, unit-tested. `kind` decides which phone limits apply. */
export function isRateLimited(kind: "booking" | "waitlist", c: AbuseCounts): boolean {
  if (c.ipLastHour !== null && c.ipLastHour >= LIMITS.ipPerHour) return true;
  if (kind === "booking") return c.phoneLastDay >= LIMITS.phonePerDay || c.phoneUpcoming >= LIMITS.phoneUpcoming;
  return c.waitlistLastDay >= LIMITS.waitlistPerDay;
}

/** Salted hash of the caller's IP, or null when unknown (e.g. local dev). */
export async function clientIpHash(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  if (!ip) return null;
  return createHash("sha256").update(`${env.serviceRoleKey()}:${ip}`).digest("hex").slice(0, 32);
}

export async function checkPublicAbuse(
  db: SupabaseClient,
  kind: "booking" | "waitlist",
  opts: { businessId: string; phone: string; ipHash: string | null },
): Promise<boolean> {
  const now = Date.now();
  const hourAgo = new Date(now - 3_600_000).toISOString();
  const dayAgo = new Date(now - 86_400_000).toISOString();
  const nowIso = new Date(now).toISOString();

  const ipQuery = opts.ipHash
    ? db
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("business_id", opts.businessId)
        .gte("created_at", hourAgo)
        .eq("data->>ip", opts.ipHash)
    : null;

  const { data: customers } = await db.from("customers").select("id").eq("business_id", opts.businessId).eq("phone", opts.phone);
  const ids = (customers ?? []).map((c) => c.id);

  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [ipLastHour, phoneLastDay, phoneUpcoming, waitlistLastDay] = await Promise.all([
    ipQuery ? count(ipQuery) : Promise.resolve(null),
    ids.length && kind === "booking"
      ? count(db.from("appointments").select("id", { count: "exact", head: true }).in("customer_id", ids).eq("source", "booking_page").gte("created_at", dayAgo))
      : 0,
    ids.length && kind === "booking"
      ? count(db.from("appointments").select("id", { count: "exact", head: true }).in("customer_id", ids).eq("source", "booking_page").in("status", ["scheduled", "confirmed"]).gte("start_at", nowIso))
      : 0,
    ids.length && kind === "waitlist"
      ? count(db.from("waitlist_entries").select("id", { count: "exact", head: true }).in("customer_id", ids).eq("source", "booking_page").gte("created_at", dayAgo))
      : 0,
  ]);

  return isRateLimited(kind, { ipLastHour, phoneLastDay, phoneUpcoming, waitlistLastDay });
}
