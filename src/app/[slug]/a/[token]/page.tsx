import { notFound } from "next/navigation";
import { getPublicBusiness } from "@/lib/booking/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { BusinessHeader } from "../../BusinessHeader";
import { ManageBooking } from "./ManageBooking";
import { PHOTO_COLUMNS, withSignedUrls } from "@/lib/photos";

export const metadata = { title: "Booking", robots: { index: false } };

export default async function ManagePage({ params, searchParams }: { params: Promise<{ slug: string; token: string }>; searchParams: Promise<{ new?: string; photos?: string }> }) {
  const { slug, token } = await params;
  const { new: isNew, photos: photosParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const business = (await getPublicBusiness(slug))!;
  const db = createAdminClient();
  const { data: appt } = await db
    .from("appointments")
    .select("id, start_at, end_at, status, price, currency, service_id, staff_id, public_token, service_label, service:services(name, duration_minutes), items:appointment_services(service_id, position), staff:staff(name), customer:customers(first_name)")
    .eq("public_token", token)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!appt) notFound();
  const { data: photoRows } = await db.from("appointment_photos").select(PHOTO_COLUMNS).eq("appointment_id", appt.id).eq("kind", "reference").order("created_at");
  const photos = await withSignedUrls(db, photoRows ?? []);

  return (
    <div className="min-h-dvh sm:min-h-0">
      <BusinessHeader business={business} />
      <ManageBooking
        slug={slug}
        isNew={isNew === "1"}
        appt={appt as never}
        address={[business.address, business.city].filter(Boolean).join(", ")}
        businessPhone={business.phone}
        photos={photos.map(({ id, kind, url }) => ({ id, kind, url }))}
        photosFailed={photosParam === "failed"}
      />
    </div>
  );
}
