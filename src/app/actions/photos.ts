"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { getPublicBusiness } from "@/lib/booking/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTOS_BUCKET, PHOTO_COLUMNS, createUploadTargets, registerPhotos, withSignedUrls, type Photo, type PhotoKind, type UploadTarget } from "@/lib/photos";
import { fail, ok, type ActionResult } from "./result";

// Photo uploads happen in two steps: start* returns signed upload URLs (after
// checking who is asking and the per-appointment limit), the browser uploads the
// files directly to Storage, and finish* records the files that really arrived.

const uuid = z.uuid();
const types = z.array(z.string().max(40)).min(1).max(12);
const paths = z.array(z.string().max(200)).min(1).max(12);
const kind = z.enum(["reference", "result"]);

function targetsResult(r: UploadTarget[] | "limit" | "invalid"): ActionResult<UploadTarget[]> {
  if (r === "limit") return fail("errors.photo_limit");
  if (r === "invalid") return fail("errors.invalid_photo");
  return ok(r);
}

// ---------------------------------------------------------------------------
// Customer: reference photos, authorised by the booking's private link token.
// ---------------------------------------------------------------------------

async function publicScope(slug: string, token: string) {
  if (!uuid.safeParse(token).success) return null;
  const business = await getPublicBusiness(slug);
  if (!business) return null;
  const db = createAdminClient();
  const { data: appt } = await db
    .from("appointments")
    .select("id, customer_id, status, end_at")
    .eq("public_token", token)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!appt) return null;
  const open = (appt.status === "scheduled" || appt.status === "confirmed") && Date.parse(appt.end_at) > Date.now();
  return { db, open, scope: { businessId: business.id, appointmentId: appt.id as string, customerId: appt.customer_id as string } };
}

export async function startReferenceUpload(slug: string, token: string, fileTypes: string[]): Promise<ActionResult<UploadTarget[]>> {
  if (!types.safeParse(fileTypes).success) return fail("errors.invalid_photo");
  const ctx = await publicScope(slug, token);
  if (!ctx) return fail("errors.not_found");
  if (!ctx.open) return fail("errors.cannot_change");
  return targetsResult(await createUploadTargets(ctx.db, ctx.scope, "reference", fileTypes));
}

export async function finishReferenceUpload(slug: string, token: string, uploaded: string[]): Promise<ActionResult<{ count: number }>> {
  if (!paths.safeParse(uploaded).success) return fail("errors.invalid");
  const ctx = await publicScope(slug, token);
  if (!ctx) return fail("errors.not_found");
  const count = await registerPhotos(ctx.db, ctx.scope, "reference", uploaded, null);
  revalidatePath(`/${slug}/a/${token}`);
  revalidatePath("/customers", "layout");
  return ok({ count });
}

// ---------------------------------------------------------------------------
// Business: reference and finished-work photos on any of its appointments.
// ---------------------------------------------------------------------------

async function ownerScope(appointmentId: string) {
  if (!uuid.safeParse(appointmentId).success) return null;
  const { business, supabase, user } = await requireBusiness();
  // Read through the user's client so RLS confirms the appointment is theirs.
  const { data: appt } = await supabase.from("appointments").select("id, customer_id").eq("id", appointmentId).eq("business_id", business.id).maybeSingle();
  if (!appt) return null;
  return { db: createAdminClient(), supabase, user, scope: { businessId: business.id, appointmentId: appt.id as string, customerId: appt.customer_id as string } };
}

export async function startPhotoUpload(appointmentId: string, photoKind: PhotoKind, fileTypes: string[]): Promise<ActionResult<UploadTarget[]>> {
  if (!kind.safeParse(photoKind).success || !types.safeParse(fileTypes).success) return fail("errors.invalid_photo");
  const ctx = await ownerScope(appointmentId);
  if (!ctx) return fail("errors.not_found");
  return targetsResult(await createUploadTargets(ctx.db, ctx.scope, photoKind, fileTypes));
}

export async function finishPhotoUpload(appointmentId: string, photoKind: PhotoKind, uploaded: string[]): Promise<ActionResult<{ count: number }>> {
  if (!kind.safeParse(photoKind).success || !paths.safeParse(uploaded).success) return fail("errors.invalid");
  const ctx = await ownerScope(appointmentId);
  if (!ctx) return fail("errors.not_found");
  const count = await registerPhotos(ctx.db, ctx.scope, photoKind, uploaded, ctx.user.id);
  revalidatePath("/customers", "layout");
  return ok({ count });
}

export async function getAppointmentPhotos(appointmentId: string): Promise<ActionResult<Photo[]>> {
  const ctx = await ownerScope(appointmentId);
  if (!ctx) return fail("errors.not_found");
  const { data } = await ctx.supabase.from("appointment_photos").select(PHOTO_COLUMNS).eq("appointment_id", appointmentId).order("created_at");
  return ok(await withSignedUrls(ctx.db, data ?? []));
}

export async function deletePhoto(photoId: string): Promise<ActionResult> {
  if (!uuid.safeParse(photoId).success) return fail("errors.invalid");
  const { business, supabase } = await requireBusiness();
  const { data: photo } = await supabase.from("appointment_photos").select("id, storage_path").eq("id", photoId).eq("business_id", business.id).maybeSingle();
  if (!photo) return fail("errors.not_found");
  await createAdminClient().storage.from(PHOTOS_BUCKET).remove([photo.storage_path]);
  await supabase.from("appointment_photos").delete().eq("id", photo.id);
  revalidatePath("/customers", "layout");
  return ok(undefined);
}
