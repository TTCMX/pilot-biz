import { requireBusiness } from "@/lib/context";
import { segmentContext, segmentsOf, SEGMENTS, type Segment } from "@/lib/metrics/customers";
import type { Customer, CustomerStats } from "@/lib/types";
import { CustomersView } from "./CustomersView";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ segment?: string; q?: string; new?: string }> }) {
  const { business, supabase } = await requireBusiness();
  const sp = await searchParams;
  const segment: Segment = (SEGMENTS as readonly string[]).includes(sp.segment ?? "") ? (sp.segment as Segment) : "all";

  const [customers, stats] = await Promise.all([
    supabase.from("customers").select("*").eq("business_id", business.id).order("first_name").limit(5000),
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

  return <CustomersView customers={filtered} counts={counts} segment={segment} q={sp.q ?? ""} openNew={sp.new === "1"} />;
}
