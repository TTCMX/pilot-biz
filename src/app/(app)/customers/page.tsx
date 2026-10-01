import { requireBusiness } from "@/lib/context";
import { segmentContext, segmentsOf, SEGMENTS, type Segment } from "@/lib/metrics/customers";
import type { Customer, CustomerStats } from "@/lib/types";
import { CustomersView } from "./CustomersView";

export const metadata = { title: "Customers" };

const PAGE_SIZE = 100;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ segment?: string; q?: string; new?: string; limit?: string }> }) {
  const { business, supabase } = await requireBusiness();
  const sp = await searchParams;
  const segment: Segment = (SEGMENTS as readonly string[]).includes(sp.segment ?? "") ? (sp.segment as Segment) : "all";

  const [customers, stats] = await Promise.all([
    supabase.from("customers").select("id, first_name, last_name, email, phone, created_at").eq("business_id", business.id).order("first_name").limit(5000),
    supabase.from("customer_stats").select("*").eq("business_id", business.id).limit(5000),
  ]);
  const statsById = new Map(((stats.data ?? []) as CustomerStats[]).map((s) => [s.customer_id, s]));
  const list = ((customers.data ?? []) as Customer[]).map((c) => ({ ...c, stats: statsById.get(c.id) ?? null }));
  const ctx = segmentContext(list);
  const withSegments = list.map((c) => ({ ...c, segments: segmentsOf(c, ctx) }));
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s, withSegments.filter((c) => c.segments.includes(s)).length])) as Record<Segment, number>;

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = withSegments.filter(
    (c) =>
      c.segments.includes(segment) &&
      (!q || `${c.first_name} ${c.last_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q)),
  );

  // Render a page at a time: thousands of rows would make the screen slow to load.
  const limit = Math.min(Math.max(Number(sp.limit) || PAGE_SIZE, PAGE_SIZE), 5000);
  return <CustomersView customers={filtered.slice(0, limit)} total={filtered.length} limit={limit} counts={counts} segment={segment} q={sp.q ?? ""} openNew={sp.new === "1"} />;
}
