import type { Metadata } from "next";
import { getPublicBusiness, getPublicCatalog } from "@/lib/booking/public";
import { BusinessHeader } from "./BusinessHeader";
import { BookingFlow } from "./BookingFlow";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishedLooks } from "@/lib/photos";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const business = await getPublicBusiness((await params).slug);
  return { title: business?.name ?? "Booking" };
}

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string; staff?: string; rebook?: string; test?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const business = (await getPublicBusiness(slug))!;
  const catalog = await getPublicCatalog(business.id);
  const looks = await publishedLooks(createAdminClient(), business.id, catalog.services.map((s) => s.id));
  return (
    <div className="min-h-dvh sm:min-h-0">
      <BusinessHeader business={business} />
      <BookingFlow
        slug={slug}
        catalog={catalog}
        looks={looks}
        initialServiceId={sp.service ?? null}
        initialStaffId={sp.staff ?? null}
        rebookToken={sp.rebook ?? null}
        isTest={sp.test === "1"}
      />
    </div>
  );
}
