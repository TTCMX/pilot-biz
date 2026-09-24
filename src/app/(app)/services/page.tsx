import { requireBusiness } from "@/lib/context";
import { ServicesView } from "./ServicesView";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const { business, supabase } = await requireBusiness();
  const [services, staff, links] = await Promise.all([
    supabase.from("services").select("*").eq("business_id", business.id).order("active", { ascending: false }).order("sort_order").order("created_at"),
    supabase.from("staff").select("id, name, color").eq("business_id", business.id).eq("active", true).order("sort_order"),
    supabase.from("staff_services").select("staff_id, service_id").eq("business_id", business.id),
  ]);
  return <ServicesView services={(services.data ?? []).map((s) => ({ ...s, price: Number(s.price) }))} staff={staff.data ?? []} links={links.data ?? []} currency={business.currency} />;
}
