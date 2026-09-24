import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createT } from "@/lib/i18n";
import { formatDateTime, formatLocalDate, formatMoney, formatWallTime, localDateOf } from "@/lib/i18n/format";
import { formatPhone } from "@/lib/phone";
import { env } from "@/lib/env";
import { isEmailEnabled, sendEmail } from "@/lib/email/send";
import { customerEmail, ownerEmail, ownerWaitlistEmail, type CustomerEmailKind, type OwnerEmailKind } from "@/lib/email/templates";
import { customerName, type Business } from "@/lib/types";

// Email notifications run after the response is sent, so they never slow down
// or break a booking. Messages are informational; nothing is sent to WhatsApp/SMS.

type AppointmentEvent = "booked" | "rescheduled" | "cancelled";

const OWNER_KIND: Record<AppointmentEvent, OwnerEmailKind> = { booked: "new_booking", rescheduled: "rescheduled", cancelled: "cancelled" };

async function ownerEmails(businessId: string): Promise<string[]> {
  const db = createAdminClient();
  const { data: members } = await db.from("business_members").select("user_id").eq("business_id", businessId).in("role", ["owner", "admin"]);
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await db.from("profiles").select("email").in("id", ids);
  return (profiles ?? []).map((p) => p.email).filter((e): e is string => !!e);
}

async function sendAppointmentEmails(event: AppointmentEvent, appointmentId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("appointments")
    .select("start_at, price, currency, notes, public_token, business:businesses(*), customer:customers(first_name, last_name, email, phone), service:services(name), staff:staff(name)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!data) return;
  const business = data.business as unknown as Business;
  const customer = data.customer as unknown as { first_name: string; last_name: string | null; email: string | null; phone: string | null };
  const t = createT(business.language);
  const f = { locale: business.locale, timezone: business.timezone };
  const appUrl = env.appUrl();
  const owners = await ownerEmails(business.id);
  const base = {
    businessName: business.name,
    customerName: customerName(customer),
    serviceName: (data.service as unknown as { name: string } | null)?.name ?? "",
    staffName: (data.staff as unknown as { name: string } | null)?.name ?? "",
    when: formatDateTime(data.start_at, f),
    price: formatMoney(Number(data.price), data.currency, business.locale),
    address: [business.address, business.city].filter(Boolean).join(", ") || null,
    businessPhone: business.phone ? formatPhone(business.phone) : null,
  };

  const jobs: Promise<unknown>[] = [];
  if (customer.email) {
    const link = event === "cancelled" ? `${appUrl}/${business.slug}` : `${appUrl}/${business.slug}/a/${data.public_token}`;
    const content = customerEmail(event as CustomerEmailKind, { ...base, customerName: customer.first_name, link }, t);
    jobs.push(sendEmail({ to: [customer.email], ...content, fromName: business.name, replyTo: owners[0] ?? null }));
  }
  if (owners.length) {
    const content = ownerEmail(
      OWNER_KIND[event],
      {
        ...base,
        link: `${appUrl}/calendar?date=${localDateOf(data.start_at, business.timezone)}`,
        customerPhone: formatPhone(customer.phone),
        customerEmail: customer.email ?? "",
        notes: data.notes ?? "",
      },
      t,
    );
    jobs.push(sendEmail({ to: owners, ...content, fromName: "Pilot", replyTo: customer.email }));
  }
  await Promise.all(jobs);
}

async function sendWaitlistEmail(entryId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("waitlist_entries")
    .select("preferred_date, preferred_start_time, preferred_end_time, business:businesses(*), customer:customers(first_name, last_name, phone), service:services(name)")
    .eq("id", entryId)
    .maybeSingle();
  if (!data) return;
  const business = data.business as unknown as Business;
  const owners = await ownerEmails(business.id);
  if (!owners.length) return;
  const t = createT(business.language);
  const customer = data.customer as unknown as { first_name: string; last_name: string | null; phone: string | null };
  const preferred = [
    data.preferred_date ? formatLocalDate(data.preferred_date, business.locale, { weekday: "long", day: "numeric", month: "long" }) : t("waitlist.any_date"),
    data.preferred_start_time ? `${formatWallTime(data.preferred_start_time, business.locale)}–${data.preferred_end_time ? formatWallTime(data.preferred_end_time, business.locale) : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const content = ownerWaitlistEmail(
    {
      businessName: business.name,
      customerName: customerName(customer),
      customerPhone: formatPhone(customer.phone),
      serviceName: (data.service as unknown as { name: string } | null)?.name ?? "",
      preferred,
      link: `${env.appUrl()}/waitlist`,
    },
    t,
  );
  await sendEmail({ to: owners, ...content, fromName: "Pilot" });
}

/** Schedule appointment emails (customer + owners) after the response. */
export function notifyAppointment(event: AppointmentEvent, appointmentId: string) {
  if (!isEmailEnabled()) return;
  after(() => sendAppointmentEmails(event, appointmentId).catch((e) => console.error("[email]", e)));
}

export function notifyWaitlist(entryId: string) {
  if (!isEmailEnabled()) return;
  after(() => sendWaitlistEmail(entryId).catch((e) => console.error("[email]", e)));
}
