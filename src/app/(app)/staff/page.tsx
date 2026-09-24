import { requireBusiness } from "@/lib/context";
import { todayIn } from "@/lib/i18n/format";
import { StaffView } from "./StaffView";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const { business, supabase } = await requireBusiness();
  const [staff, services, links, rules, exceptions] = await Promise.all([
    supabase.from("staff").select("*").eq("business_id", business.id).order("active", { ascending: false }).order("sort_order").order("created_at"),
    supabase.from("services").select("id, name").eq("business_id", business.id).eq("active", true).order("sort_order"),
    supabase.from("staff_services").select("staff_id, service_id").eq("business_id", business.id),
    supabase.from("availability_rules").select("staff_id, day_of_week, start_time, end_time").eq("business_id", business.id),
    supabase.from("availability_exceptions").select("*").eq("business_id", business.id).gte("date", todayIn(business.timezone)).order("date").limit(200),
  ]);
  return (
    <StaffView
      staff={staff.data ?? []}
      services={services.data ?? []}
      links={links.data ?? []}
      rules={rules.data ?? []}
      exceptions={exceptions.data ?? []}
      weekStart={business.week_start}
    />
  );
}
