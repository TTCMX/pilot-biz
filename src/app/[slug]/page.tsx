import type { Metadata } from "next";
import { getPublicBusiness, getPublicCatalog } from "@/lib/booking/public";
import { BusinessHeader } from "./BusinessHeader";
import { BookingFlow } from "./BookingFlow";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishedLooks } from "@/lib/photos";
import { createT } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const business = await getPublicBusiness((await params).slug);
  if (!business) return { title: "Booking" };
  const t = createT(business.language);
  const description = t("booking.meta_description", { name: business.name, city: business.city ? ` · ${business.city}` : "" });
  // Shared links (WhatsApp, Instagram) show the business name, a short line and its logo.
  return {
    title: business.name,
    description,
    openGraph: { title: business.name, description, type: "website", ...(business.logo_url ? { images: [{ url: business.logo_url }] } : {}) },
    twitter: { card: "summary", title: business.name, description },
  };
}

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string; staff?: string; rebook?: string; test?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const business = (await getPublicBusiness(slug))!;
  const [catalog, looks] = await Promise.all([getPublicCatalog(business.id), publishedLooks(createAdminClient(), business.id)]);
  return (
    <div className="min-h-dvh sm:min-h-0">
      <BusinessHeader business={business} />
      <BookingFlow
        slug={slug}
        catalog={catalog}
        looks={looks}
        initialServiceIds={(sp.service ?? "").split(",").filter(Boolean).slice(0, 5)}
        initialStaffId={sp.staff ?? null}
        rebookToken={sp.rebook ?? null}
        isTest={sp.test === "1"}
      />
    </div>
  );
}
