// Deterministic customer segmentation derived from appointment history.
// No manual tags: segments are recomputed from data every time.

import type { CustomerStats } from "@/lib/types";

export const SEGMENTS = ["all", "new", "recurring", "inactive", "vip"] as const;
export type Segment = (typeof SEGMENTS)[number];

const DAY = 86_400_000;

export type CustomerWithStats = { id: string; created_at: string; stats: CustomerStats | null };

export type SegmentContext = { vipThreshold: number; now: number };

/** VIP = top 10% by total spend among customers with 3+ visits. */
export function segmentContext(customers: CustomerWithStats[], now = Date.now()): SegmentContext {
  const spends = customers
    .filter((c) => (c.stats?.visit_count ?? 0) >= 3)
    .map((c) => Number(c.stats?.total_spend ?? 0))
    .sort((a, b) => b - a);
  const idx = Math.max(0, Math.ceil(spends.length * 0.1) - 1);
  return { vipThreshold: spends.length ? spends[idx] : Infinity, now };
}

export function isInactive(stats: CustomerStats | null, now: number, averageIntervalDays?: number | null): boolean {
  if (!stats?.last_visit || stats.next_appointment) return false;
  const threshold = Math.max(60, (averageIntervalDays ?? 0) * 2);
  return now - Date.parse(stats.last_visit) > threshold * DAY;
}

export function segmentsOf(c: CustomerWithStats, ctx: SegmentContext): Segment[] {
  const s = c.stats;
  const visits = s?.visit_count ?? 0;
  const out: Segment[] = ["all"];
  const firstSeen = s?.first_visit ? Date.parse(s.first_visit) : Date.parse(c.created_at);
  if (visits <= 1 && ctx.now - firstSeen <= 30 * DAY) out.push("new");
  if (visits >= 2) out.push("recurring");
  if (isInactive(s, ctx.now)) out.push("inactive");
  if (visits >= 3 && Number(s?.total_spend ?? 0) >= ctx.vipThreshold) out.push("vip");
  return out;
}

/** Average days between completed visits; null with fewer than 2 visits. */
export function averageIntervalDays(visitDates: string[]): number | null {
  const sorted = visitDates.map((d) => Date.parse(d)).sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const gaps = sorted.slice(1).map((t, i) => (t - sorted[i]) / DAY);
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

/** Suggested next visit date based on the customer's own rhythm (default 4 weeks). */
export function suggestedNextVisit(lastVisitIso: string, intervalDays: number | null, fallbackDays = 28): Date {
  return new Date(Date.parse(lastVisitIso) + (intervalDays ?? fallbackDays) * DAY);
}
