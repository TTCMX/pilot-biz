import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Appointment photos live in the private "photos" bucket under
// "<business_id>/<appointment_id>/<ref|res>-<uuid>.<ext>". Uploads go straight
// from the browser to Storage through one-time signed upload URLs that only the
// server hands out (after checking who is asking), and are registered in
// appointment_photos afterwards. Reads always use short-lived signed URLs.
// All storage calls here use the service-role client.

export const PHOTOS_BUCKET = "photos";
export type PhotoKind = "reference" | "result";
export const PHOTO_LIMITS: Record<PhotoKind, number> = { reference: 3, result: 12 };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const SIGNED_URL_SECONDS = 60 * 60;

export type Photo = { id: string; kind: PhotoKind; url: string; appointment_id: string | null; created_at: string };
export type UploadTarget = { path: string; token: string };
type Scope = { businessId: string; appointmentId: string; customerId: string };

export function isAllowedImageType(type: string): boolean {
  return type in EXT;
}

function prefix(scope: Scope, kind: PhotoKind) {
  return `${scope.businessId}/${scope.appointmentId}/${kind === "reference" ? "ref" : "res"}-`;
}

async function countPhotos(db: SupabaseClient, appointmentId: string, kind: PhotoKind) {
  const { count } = await db.from("appointment_photos").select("id", { count: "exact", head: true }).eq("appointment_id", appointmentId).eq("kind", kind);
  return count ?? 0;
}

/** One signed upload URL per file, within the per-appointment limit. */
export async function createUploadTargets(db: SupabaseClient, scope: Scope, kind: PhotoKind, types: string[]): Promise<UploadTarget[] | "limit" | "invalid"> {
  if (!types.length || types.some((t) => !isAllowedImageType(t))) return "invalid";
  if ((await countPhotos(db, scope.appointmentId, kind)) + types.length > PHOTO_LIMITS[kind]) return "limit";
  const targets: UploadTarget[] = [];
  for (const type of types) {
    const path = `${prefix(scope, kind)}${randomUUID()}.${EXT[type]}`;
    const { data, error } = await db.storage.from(PHOTOS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return "invalid";
    targets.push({ path, token: data.token });
  }
  return targets;
}

/** Record uploaded files. Only paths under this appointment's prefix that really exist in Storage are accepted. */
export async function registerPhotos(db: SupabaseClient, scope: Scope, kind: PhotoKind, paths: string[], uploadedBy: string | null): Promise<number> {
  const unique = [...new Set(paths)].filter((p) => p.startsWith(prefix(scope, kind)) && /^[\w/-]+\.(jpg|png|webp)$/.test(p));
  const room = PHOTO_LIMITS[kind] - (await countPhotos(db, scope.appointmentId, kind));
  const accepted: string[] = [];
  for (const path of unique.slice(0, Math.max(0, room))) {
    const { data: exists } = await db.storage.from(PHOTOS_BUCKET).exists(path);
    if (exists) accepted.push(path);
  }
  if (!accepted.length) return 0;
  const { error } = await db.from("appointment_photos").upsert(
    accepted.map((storage_path) => ({
      business_id: scope.businessId,
      customer_id: scope.customerId,
      appointment_id: scope.appointmentId,
      kind,
      storage_path,
      uploaded_by: uploadedBy,
    })),
    { onConflict: "storage_path", ignoreDuplicates: true },
  );
  return error ? 0 : accepted.length;
}

type PhotoRow = { id: string; kind: PhotoKind; storage_path: string; appointment_id: string | null; created_at: string };

/** Attach short-lived signed URLs to photo rows (rows whose file is missing are dropped). */
export async function withSignedUrls(db: SupabaseClient, rows: PhotoRow[]): Promise<Photo[]> {
  if (!rows.length) return [];
  const { data } = await db.storage.from(PHOTOS_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_SECONDS);
  const urls = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return rows.flatMap((r) => {
    const url = urls.get(r.storage_path);
    return url ? [{ id: r.id, kind: r.kind, url, appointment_id: r.appointment_id, created_at: r.created_at }] : [];
  });
}

export const PHOTO_COLUMNS = "id, kind, storage_path, appointment_id, created_at";
