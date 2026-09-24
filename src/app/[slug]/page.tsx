import type { Metadata } from "next";
import { getPublicBusiness, getPublicCatalog } from "@/lib/booking/public";
import { BusinessHeader } from "./BusinessHeader";
import { BookingFlow } from "./BookingFlow";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const business = await getPublicBusiness((await params).slug);
  return { title: business?.name ?? "Booking" };
}

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string; staff?: string; rebook?: string; test?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const business = (await getPublicBusiness(slug))!;
  const catalog = await getPublicCatalog(business.id);
  return (
    <div className="sm:overflow-hidden sm:rounded-3xl sm:border sm:border-stone-200 sm:bg-white sm:shadow-sm">
      <BusinessHeader business={business} />
      <BookingFlow
        slug={slug}
        catalog={catalog}
        initialServiceId={sp.service ?? null}
        initialStaffId={sp.staff ?? null}
        rebookToken={sp.rebook ?? null}
        isTest={sp.test === "1"}
      />
    </div>
  );
}
