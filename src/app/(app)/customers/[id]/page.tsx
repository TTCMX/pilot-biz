import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/context";
import { averageIntervalDays, suggestedNextVisit } from "@/lib/metrics/customers";
import { localDateOf, localTimeOf } from "@/lib/i18n/format";
import { serviceIdsOf, type Customer, type CustomerStats } from "@/lib/types";
import { CustomerProfile, type HistoryRow } from "./CustomerProfile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_COLUMNS, withSignedUrls } from "@/lib/photos";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business, supabase } = await requireBusiness();
  const [customer, stats, appts, photoRows] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).eq("business_id", business.id).maybeSingle(),
    supabase.from("customer_stats").select("*").eq("customer_id", id).maybeSingle(),
    supabase
      .from("appointments")
      .select("id, start_at, end_at, status, price, currency, service_id, staff_id, source, service_label, service:services(name), items:appointment_services(service_id, position), staff:staff(name)")
      .eq("customer_id", id)
      .eq("business_id", business.id)
      .order("start_at", { ascending: false })
      .limit(200),
    supabase.from("appointment_photos").select(PHOTO_COLUMNS).eq("customer_id", id).eq("business_id", business.id).order("created_at", { ascending: false }).limit(120),
  ]);
  if (!customer.data) notFound();

  const history = (appts.data ?? []) as unknown as HistoryRow[];
  const completed = history.filter((a) => a.status === "completed");
  const interval = averageIntervalDays(completed.map((a) => a.start_at));
  const last = completed[0];
  const suggested = last ? suggestedNextVisit(last.start_at, interval) : null;
  const daysSinceLast = last ? Math.floor((Date.now() - Date.parse(last.start_at)) / 86_400_000) : null;
  const s = stats.data as CustomerStats | null;
  const photos = await withSignedUrls(createAdminClient(), photoRows.data ?? []);

  const rebookHref = last
    ? `/calendar?new=1&customer=${id}&service=${serviceIdsOf(last).join(",")}&staff=${last.staff_id}&rebook=${last.id}&time=${localTimeOf(last.start_at, business.timezone)}&date=${localDateOf(
        new Date(Math.max(suggested!.getTime(), Date.now())).toISOString(),
        business.timezone,
      )}`
    : `/calendar?new=1&customer=${id}`;

  return (
    <CustomerProfile
      customer={customer.data as Customer}
      stats={s}
      history={history}
      intervalDays={interval}
      daysSinceLast={daysSinceLast}
      suggestedDate={suggested?.toISOString() ?? null}
      rebookHref={rebookHref}
      businessName={business.name}
      bookingUrl={`/${business.slug}`}
      photos={photos}
    />
  );
}
