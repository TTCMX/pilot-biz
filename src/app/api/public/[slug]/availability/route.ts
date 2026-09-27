import { NextResponse, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { getPublicBusiness } from "@/lib/booking/public";
import { MAX_SERVICES_PER_BOOKING, appointmentServiceIds, loadBookingData, slotsFor } from "@/lib/booking/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateRange } from "@/lib/booking/engine";
import { todayIn } from "@/lib/i18n/format";

// GET /api/public/:slug/availability?services=id1,id2&staff=&from=YYYY-MM-DD&days=7[&token=]
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = request.nextUrl.searchParams;
  const business = await getPublicBusiness(slug);
  if (!business) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // services=id1,id2 (several services back to back); service=id is still accepted.
  let serviceIds = (sp.get("services") ?? sp.get("service") ?? "").split(",").filter(Boolean);
  const staffId = sp.get("staff") || null;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!serviceIds.length || serviceIds.length > MAX_SERVICES_PER_BOOKING || serviceIds.some((id) => !uuid.test(id)) || (staffId && !uuid.test(staffId))) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const today = todayIn(business.timezone);
  const fromParam = sp.get("from");
  const from = fromParam && DateTime.fromISO(fromParam).isValid && fromParam >= today ? fromParam : today;
  const days = Math.min(Math.max(Number(sp.get("days")) || 7, 1), 31);
  const dates = dateRange(from, days, business.timezone);

  const db = createAdminClient();
  const data = await loadBookingData(db, business, dates[0], dates.at(-1)!);

  // When rescheduling, the customer's own appointment does not block itself.
  // It also keeps the appointment's own services and length.
  let ignoreAppointmentId: string | undefined;
  let durationMinutes: number | undefined;
  const token = sp.get("token");
  if (token && uuid.test(token)) {
    const { data: appt } = await db.from("appointments").select("id, service_id, start_at, end_at").eq("public_token", token).eq("business_id", business.id).maybeSingle();
    if (appt) {
      ignoreAppointmentId = appt.id;
      serviceIds = await appointmentServiceIds(db, appt);
      durationMinutes = Math.round((Date.parse(appt.end_at) - Date.parse(appt.start_at)) / 60_000);
    }
  }

  const result = dates.map((date) => ({
    date,
    slots: slotsFor(data, business, serviceIds, staffId, date, { ignoreAppointmentId, durationMinutes }).map((s) => ({ start: s.start, end: s.end })),
  }));
  return NextResponse.json({ timezone: business.timezone, dates: result }, { headers: { "Cache-Control": "no-store" } });
}
