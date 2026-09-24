import { notFound } from "next/navigation";
import { getPublicBusiness } from "@/lib/booking/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { BusinessHeader } from "../../BusinessHeader";
import { ManageBooking } from "./ManageBooking";

export const metadata = { title: "Booking", robots: { index: false } };

export default async function ManagePage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { slug, token } = await params;
  const { new: isNew } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const business = (await getPublicBusiness(slug))!;
  const db = createAdminClient();
  const { data: appt } = await db
    .from("appointments")
    .select("id, start_at, end_at, status, price, currency, service_id, staff_id, public_token, service:services(name, duration_minutes), staff:staff(name), customer:customers(first_name)")
    .eq("public_token", token)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!appt) notFound();

  return (
    <div className="min-h-dvh bg-white sm:min-h-0 sm:overflow-hidden sm:rounded-[28px] sm:shadow-card">
      <BusinessHeader business={business} />
      <ManageBooking
        slug={slug}
        isNew={isNew === "1"}
        appt={appt as never}
        address={[business.address, business.city].filter(Boolean).join(", ")}
        businessPhone={business.phone}
      />
    </div>
  );
}
