import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Photos live in the private "photos" bucket:
//   appointment photos  "<business_id>/<appointment_id>/<ref|res>-<uuid>.<ext>"
//   portfolio photos    "<business_id>/lookbook/pf-<uuid>.<ext>"
// Uploads go straight from the browser to Storage through one-time signed upload
// URLs that only the server hands out (after checking who is asking), and are
// registered in appointment_photos afterwards. Reads always use short-lived
// signed URLs. All storage calls here use the service-role client.
//
// Kinds: "reference" (from the customer), "result" (finished work on an
// appointment) and "portfolio" (finished work uploaded straight to the Lookbook).
// Only result and portfolio photos can be published in the Lookbook.

export const PHOTOS_BUCKET = "photos";
export type PhotoKind = "reference" | "result" | "portfolio";
/** reference/result: per appointment; portfolio: per business. */
export const PHOTO_LIMITS: Record<PhotoKind, number> = { reference: 3, result: 12, portfolio: 80 };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const SIGNED_URL_SECONDS = 60 * 60;

export type Photo = {
  id: string; kind: PhotoKind; url: string; appointment_id: string | null; service_id: string | null; created_at: string; published: boolean;
};
export type UploadTarget = { path: string; token: string };
/** Where a photo belongs. Portfolio photos have no appointment or customer. */
export type Scope = { businessId: string; appointmentId: string | null; customerId: string | null; serviceId: string | null };

export function isAllowedImageType(type: string): boolean {
  return type in EXT;
}

function prefix(scope: Scope, kind: PhotoKind) {
  if (kind === "portfolio") return `${scope.businessId}/lookbook/pf-`;
  return `${scope.businessId}/${scope.appointmentId}/${kind === "reference" ? "ref" : "res"}-`;
}

async function countPhotos(db: SupabaseClient, scope: Scope, kind: PhotoKind) {
  let q = db.from("appointment_photos").select("id", { count: "exact", head: true }).eq("business_id", scope.businessId).eq("kind", kind);
  if (kind !== "portfolio") q = q.eq("appointment_id", scope.appointmentId);
  const { count } = await q;
  return count ?? 0;
}

function validScope(scope: Scope, kind: PhotoKind) {
  return kind === "portfolio" ? !!scope.serviceId && !scope.appointmentId && !scope.customerId : !!scope.appointmentId && !!scope.customerId;
}

/** One signed upload URL per file, within the limit. */
export async function createUploadTargets(db: SupabaseClient, scope: Scope, kind: PhotoKind, types: string[]): Promise<UploadTarget[] | "limit" | "invalid"> {
  if (!validScope(scope, kind) || !types.length || types.some((t) => !isAllowedImageType(t))) return "invalid";
  if ((await countPhotos(db, scope, kind)) + types.length > PHOTO_LIMITS[kind]) return "limit";
  const targets: UploadTarget[] = [];
  for (const type of types) {
    const path = `${prefix(scope, kind)}${randomUUID()}.${EXT[type]}`;
    const { data, error } = await db.storage.from(PHOTOS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return "invalid";
    targets.push({ path, token: data.token });
  }
  return targets;
}

/** Record uploaded files. Only paths under the scope's prefix that really exist in Storage are accepted. */
export async function registerPhotos(db: SupabaseClient, scope: Scope, kind: PhotoKind, paths: string[], uploadedBy: string | null): Promise<number> {
  if (!validScope(scope, kind)) return 0;
  const unique = [...new Set(paths)].filter((p) => p.startsWith(prefix(scope, kind)) && /^[\w/-]+\.(jpg|png|webp)$/.test(p));
  const room = PHOTO_LIMITS[kind] - (await countPhotos(db, scope, kind));
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
      service_id: scope.serviceId,
      kind,
      storage_path,
      uploaded_by: uploadedBy,
      published: kind === "portfolio", // uploaded to the Lookbook on purpose
    })),
    { onConflict: "storage_path", ignoreDuplicates: true },
  );
  return error ? 0 : accepted.length;
}

type PhotoRow = { id: string; kind: PhotoKind; storage_path: string; appointment_id: string | null; service_id?: string | null; created_at: string; published?: boolean };

// Signed URLs are reused while they have plenty of life left, so the browser can
// cache the image (a new token = a new URL = a new download) and Storage isn't
// asked to sign the same file on every page view. The cache only ever answers
// for rows the caller already loaded with its own permissions.
const signedCache = new Map<string, { url: string; expiresAt: number }>();
const REUSE_MARGIN_MS = 15 * 60 * 1000;
const CACHE_LIMIT = 5000;

/** Attach short-lived signed URLs to photo rows (rows whose file is missing are dropped). */
export async function withSignedUrls(db: SupabaseClient, rows: PhotoRow[]): Promise<Photo[]> {
  if (!rows.length) return [];
  const now = Date.now();
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const r of rows) {
    const hit = signedCache.get(r.storage_path);
    if (hit && hit.expiresAt - now > REUSE_MARGIN_MS) urls.set(r.storage_path, hit.url);
    else missing.push(r.storage_path);
  }
  if (missing.length) {
    const { data } = await db.storage.from(PHOTOS_BUCKET).createSignedUrls(missing, SIGNED_URL_SECONDS);
    if (signedCache.size > CACHE_LIMIT) signedCache.clear();
    for (const d of data ?? []) {
      if (!d.signedUrl || !d.path) continue;
      urls.set(d.path, d.signedUrl);
      signedCache.set(d.path, { url: d.signedUrl, expiresAt: now + SIGNED_URL_SECONDS * 1000 });
    }
  }
  return rows.flatMap((r) => {
    const url = urls.get(r.storage_path);
    return url
      ? [{ id: r.id, kind: r.kind, url, appointment_id: r.appointment_id, service_id: r.service_id ?? null, created_at: r.created_at, published: !!r.published }]
      : [];
  });
}

/** Forget cached URLs of deleted files. */
export function forgetSignedUrls(paths: string[]) {
  for (const p of paths) signedCache.delete(p);
}

export const PHOTO_COLUMNS = "id, kind, storage_path, appointment_id, service_id, created_at, published";

// ---------------------------------------------------------------------------
// Lookbook: published finished-work photos, each tied to the service it shows.
// ---------------------------------------------------------------------------

export type Look = { id: string; url: string; serviceId: string };
const LOOKBOOK_SIZE = 30;

/** Published looks whose service can still be booked online, newest first. */
export async function publishedLooks(db: SupabaseClient, businessId: string): Promise<Look[]> {
  const { data } = await db
    .from("appointment_photos")
    .select(`${PHOTO_COLUMNS}, service:services!inner(active)`)
    .eq("business_id", businessId)
    .eq("published", true)
    .in("kind", ["result", "portfolio"])
    .eq("service.active", true)
    .order("created_at", { ascending: false })
    .limit(LOOKBOOK_SIZE);
  const signed = await withSignedUrls(db, (data ?? []) as PhotoRow[]);
  return signed.map((p) => ({ id: p.id, url: p.url, serviceId: p.service_id! }));
}

/** Copy a published look into a new appointment as the customer's reference photo. */
export async function attachLookAsReference(db: SupabaseClient, scope: Scope, photoId: string): Promise<boolean> {
  const { data: look } = await db
    .from("appointment_photos")
    .select("storage_path")
    .eq("id", photoId)
    .eq("business_id", scope.businessId)
    .eq("published", true)
    .in("kind", ["result", "portfolio"])
    .maybeSingle();
  if (!look) return false;
  if ((await countPhotos(db, scope, "reference")) >= PHOTO_LIMITS.reference) return false;
  const ext = look.storage_path.split(".").pop();
  const path = `${prefix(scope, "reference")}${randomUUID()}.${ext}`;
  const { error } = await db.storage.from(PHOTOS_BUCKET).copy(look.storage_path, path);
  if (error) return false;
  return (await registerPhotos(db, scope, "reference", [path], null)) === 1;
}
