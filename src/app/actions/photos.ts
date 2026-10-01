"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { getPublicBusiness } from "@/lib/booking/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTOS_BUCKET, PHOTO_COLUMNS, attachLookAsReference, createUploadTargets, forgetSignedUrls, registerPhotos, withSignedUrls, type Photo, type PhotoKind, type UploadTarget } from "@/lib/photos";
import { fail, ok, type ActionResult } from "./result";

// Photo uploads happen in two steps: start* returns signed upload URLs (after
// checking who is asking and the per-appointment limit), the browser uploads the
// files directly to Storage, and finish* records the files that really arrived.

const uuid = z.uuid();
const types = z.array(z.string().max(40)).min(1).max(12);
const paths = z.array(z.string().max(200)).min(1).max(12);
const kind = z.enum(["reference", "result"]); // appointment photos; portfolio has its own actions

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
    .select("id, customer_id, service_id, status, end_at")
    .eq("public_token", token)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!appt) return null;
  const open = (appt.status === "scheduled" || appt.status === "confirmed") && Date.parse(appt.end_at) > Date.now();
  return { db, open, scope: { businessId: business.id, appointmentId: appt.id as string, customerId: appt.customer_id as string, serviceId: appt.service_id as string } };
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
  if (!ctx.open) return fail("errors.cannot_change");
  const count = await registerPhotos(ctx.db, ctx.scope, "reference", uploaded, null);
  revalidatePath(`/${slug}/a/${token}`);
  revalidatePath("/customers", "layout");
  return ok({ count });
}

/** "Quiero este": attach the chosen Lookbook photo to the new booking as its reference. */
export async function attachLook(slug: string, token: string, photoId: string): Promise<ActionResult> {
  if (!uuid.safeParse(photoId).success) return fail("errors.invalid");
  const ctx = await publicScope(slug, token);
  if (!ctx) return fail("errors.not_found");
  if (!ctx.open) return fail("errors.cannot_change");
  if (!(await attachLookAsReference(ctx.db, ctx.scope, photoId))) return fail("errors.generic");
  revalidatePath(`/${slug}/a/${token}`);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Business: reference and finished-work photos on any of its appointments.
// ---------------------------------------------------------------------------

async function ownerScope(appointmentId: string) {
  if (!uuid.safeParse(appointmentId).success) return null;
  const { business, supabase, user } = await requireBusiness();
  // Read through the user's client so RLS confirms the appointment is theirs.
  const { data: appt } = await supabase.from("appointments").select("id, customer_id, service_id").eq("id", appointmentId).eq("business_id", business.id).maybeSingle();
  if (!appt) return null;
  return {
    db: createAdminClient(),
    supabase,
    user,
    scope: { businessId: business.id, appointmentId: appt.id as string, customerId: appt.customer_id as string, serviceId: appt.service_id as string },
  };
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
  forgetSignedUrls([photo.storage_path]);
  await supabase.from("appointment_photos").delete().eq("id", photo.id);
  revalidatePath("/customers", "layout");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Lookbook management (business only).
// ---------------------------------------------------------------------------

async function ownService(serviceId: string) {
  if (!uuid.safeParse(serviceId).success) return null;
  const { business, supabase, user } = await requireBusiness();
  const { data } = await supabase.from("services").select("id").eq("id", serviceId).eq("business_id", business.id).maybeSingle();
  return data ? { business, supabase, user, scope: { businessId: business.id, appointmentId: null, customerId: null, serviceId } } : null;
}

function revalidateLookbook(slug: string) {
  revalidatePath("/lookbook");
  revalidatePath("/customers", "layout");
  revalidatePath(`/${slug}`);
}

/** Upload finished-work photos straight to the Lookbook, tied to a service. */
export async function startPortfolioUpload(serviceId: string, fileTypes: string[]): Promise<ActionResult<UploadTarget[]>> {
  if (!types.safeParse(fileTypes).success) return fail("errors.invalid_photo");
  const ctx = await ownService(serviceId);
  if (!ctx) return fail("errors.not_found");
  return targetsResult(await createUploadTargets(createAdminClient(), ctx.scope, "portfolio", fileTypes));
}

export async function finishPortfolioUpload(serviceId: string, uploaded: string[]): Promise<ActionResult<{ count: number }>> {
  if (!paths.safeParse(uploaded).success) return fail("errors.invalid");
  const ctx = await ownService(serviceId);
  if (!ctx) return fail("errors.not_found");
  const count = await registerPhotos(createAdminClient(), ctx.scope, "portfolio", uploaded, ctx.user.id);
  revalidateLookbook(ctx.business.slug);
  return ok({ count });
}

/** Show or hide a finished-work photo in the public Lookbook. */
export async function setPhotoPublished(photoId: string, published: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(photoId).success) return fail("errors.invalid");
  const { business, supabase } = await requireBusiness();
  const { data, error } = await supabase
    .from("appointment_photos")
    .update({ published })
    .eq("id", photoId)
    .eq("business_id", business.id)
    .in("kind", ["result", "portfolio"])
    .select("id")
    .maybeSingle();
  if (error || !data) return fail("errors.not_found");
  revalidateLookbook(business.slug);
  return ok(undefined);
}

/** Change which service a Lookbook photo books ("Quiero este"). */
export async function setPhotoService(photoId: string, serviceId: string): Promise<ActionResult> {
  if (!uuid.safeParse(photoId).success) return fail("errors.invalid");
  const ctx = await ownService(serviceId);
  if (!ctx) return fail("errors.not_found");
  const { data, error } = await ctx.supabase
    .from("appointment_photos")
    .update({ service_id: serviceId })
    .eq("id", photoId)
    .eq("business_id", ctx.business.id)
    .in("kind", ["result", "portfolio"])
    .select("id")
    .maybeSingle();
  if (error || !data) return fail("errors.not_found");
  revalidateLookbook(ctx.business.slug);
  return ok(undefined);
}
