import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Basic audit trail. Never throws: auditing must not break the user action. */
export async function audit(
  supabase: SupabaseClient,
  entry: { business_id: string; actor_id: string | null; action: string; entity: string; entity_id?: string | null; data?: unknown },
) {
  try {
    await supabase.from("audit_log").insert({ ...entry, entity_id: entry.entity_id ?? null, data: entry.data ?? null });
  } catch {
    // ignore
  }
}
