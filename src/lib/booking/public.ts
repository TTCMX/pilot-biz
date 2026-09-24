import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Business } from "@/lib/types";

// Public (anonymous) data access. Only exposes fields safe for customers.

export const getPublicBusiness = cache(async (slug: string): Promise<Business | null> => {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const db = createAdminClient();
  const { data } = await db.from("businesses").select("*").eq("slug", slug).maybeSingle();
  return (data as Business) ?? null;
});

export async function getPublicCatalog(businessId: string) {
  const db = createAdminClient();
  const [services, staff, links] = await Promise.all([
    db.from("services").select("id, name, description, duration_minutes, price, currency, category").eq("business_id", businessId).eq("active", true).order("sort_order").order("created_at"),
    db.from("staff").select("id, name, color").eq("business_id", businessId).eq("active", true).order("sort_order").order("created_at"),
    db.from("staff_services").select("staff_id, service_id").eq("business_id", businessId),
  ]);
  return {
    services: (services.data ?? []).map((s) => ({ ...s, price: Number(s.price) })),
    staff: staff.data ?? [],
    links: links.data ?? [],
  };
}

export type PublicCatalog = Awaited<ReturnType<typeof getPublicCatalog>>;
