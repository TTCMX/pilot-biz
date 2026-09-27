import { requireBusiness } from "@/lib/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_COLUMNS, withSignedUrls } from "@/lib/photos";
import { LookbookManager } from "./LookbookManager";

export const metadata = { title: "Lookbook" };

export default async function LookbookPage() {
  const { business, supabase } = await requireBusiness();
  const [services, photos] = await Promise.all([
    supabase.from("services").select("id, name").eq("business_id", business.id).eq("active", true).order("sort_order").order("created_at"),
    supabase
      .from("appointment_photos")
      .select(PHOTO_COLUMNS)
      .eq("business_id", business.id)
      .in("kind", ["result", "portfolio"])
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  return <LookbookManager services={services.data ?? []} photos={await withSignedUrls(createAdminClient(), photos.data ?? [])} bookingPath={`/${business.slug}`} />;
}
