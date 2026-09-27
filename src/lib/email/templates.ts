// Localized, deterministic email templates. Every interpolated value is escaped.

import type { T } from "@/lib/i18n";

export type EmailContent = { subject: string; html: string; text: string };

export type AppointmentEmailData = {
  businessName: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  when: string; // already formatted in the business locale + timezone
  price: string; // already formatted
  address: string | null;
  businessPhone: string | null;
  link: string;
};

export type CustomerEmailKind = "booked" | "rescheduled" | "cancelled";
export type OwnerEmailKind = "new_booking" | "rescheduled" | "cancelled";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Botanical palette: Niebla background, Lino card, Salvia action, Bosque ink. Flat, no gradients.
function layout(opts: { heading: string; intro: string; rows: [string, string][]; cta?: { label: string; href: string }; footer: string }): string {
  const rows = opts.rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0"><div style="color:#55605a;font-size:13px">${escapeHtml(k)}</div><div style="color:#1f2a22;font-size:15px;font-weight:600;margin-top:2px">${escapeHtml(v)}</div></td></tr>`,
    )
    .join("");
  const cta = opts.cta
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(opts.cta.href)}" style="display:inline-block;background:#55694f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 24px;border-radius:999px">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#eceee4;font-family:'DM Sans',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceee4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#f6f7f1;border-radius:26px;padding:28px">
<tr><td>
<h1 style="margin:0 0 10px;font-family:Fraunces,Georgia,'Times New Roman',serif;font-weight:300;font-size:26px;line-height:1.15;color:#1f2a22">${escapeHtml(opts.heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;color:#37413a;line-height:1.5">${escapeHtml(opts.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #d9b27c;padding-top:8px">${rows}</table>
${cta}
<p style="margin:20px 0 0;font-size:12px;color:#55605a;line-height:1.5">${escapeHtml(opts.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function textVersion(heading: string, intro: string, rows: [string, string][], link?: string, footer?: string): string {
  return [heading, "", intro, "", ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), ...(link ? ["", link] : []), ...(footer ? ["", footer] : [])].join("\n");
}

export function customerEmail(kind: CustomerEmailKind, d: AppointmentEmailData, t: T): EmailContent {
  const vars = { name: d.customerName, business: d.businessName, when: d.when };
  const heading = t(`email.customer.${kind}.heading`, vars);
  const intro = t(`email.customer.${kind}.intro`, vars);
  const rows: [string, string][] =
    kind === "cancelled"
      ? [[t("appointment.service"), d.serviceName], [t("appointment.when"), d.when]]
      : [
          [t("appointment.service"), d.serviceName],
          [t("appointment.when"), d.when],
          [t("appointment.staff"), d.staffName],
          [t("appointment.price"), d.price],
          [t("business.address"), d.address ?? ""],
          [t("business.phone"), d.businessPhone ?? ""],
        ];
  const cta = { label: kind === "cancelled" ? t("booking.book_again") : t("email.manage_booking"), href: d.link };
  const footer = t("email.customer.footer", vars);
  return {
    subject: t(`email.customer.${kind}.subject`, vars),
    html: layout({ heading, intro, rows, cta, footer }),
    text: textVersion(heading, intro, rows, `${cta.label}: ${d.link}`, footer),
  };
}

export function ownerEmail(kind: OwnerEmailKind, d: AppointmentEmailData & { customerPhone: string; customerEmail: string; notes: string }, t: T): EmailContent {
  const vars = { name: d.customerName, business: d.businessName, when: d.when, service: d.serviceName };
  const heading = t(`email.owner.${kind}.heading`, vars);
  const intro = t(`email.owner.${kind}.intro`, vars);
  const rows: [string, string][] = [
    [t("appointment.customer"), d.customerName],
    [t("customer.phone"), d.customerPhone],
    [t("customer.email"), d.customerEmail],
    [t("appointment.service"), d.serviceName],
    [t("appointment.when"), d.when],
    [t("appointment.staff"), d.staffName],
    [t("appointment.price"), d.price],
    [t("appointment.notes"), d.notes],
  ];
  const cta = { label: t("dashboard.view_calendar"), href: d.link };
  const footer = t("email.owner.footer");
  return {
    subject: t(`email.owner.${kind}.subject`, vars),
    html: layout({ heading, intro, rows, cta, footer }),
    text: textVersion(heading, intro, rows, d.link, footer),
  };
}

export function ownerWaitlistEmail(d: { businessName: string; customerName: string; customerPhone: string; serviceName: string; preferred: string; link: string }, t: T): EmailContent {
  const vars = { name: d.customerName, service: d.serviceName };
  const heading = t("email.owner.waitlist.heading", vars);
  const intro = t("email.owner.waitlist.intro", vars);
  const rows: [string, string][] = [
    [t("appointment.customer"), d.customerName],
    [t("customer.phone"), d.customerPhone],
    [t("appointment.service"), d.serviceName],
    [t("waitlist.preferred_date"), d.preferred],
  ];
  const footer = t("email.owner.footer");
  return {
    subject: t("email.owner.waitlist.subject", vars),
    html: layout({ heading, intro, rows, cta: { label: t("nav.waitlist"), href: d.link }, footer }),
    text: textVersion(heading, intro, rows, d.link, footer),
  };
}

export function testEmail(d: { businessName: string }, t: T): EmailContent {
  const heading = t("email.test.heading");
  const intro = t("email.test.intro", { business: d.businessName });
  const footer = t("email.owner.footer");
  return {
    subject: t("email.test.subject", { business: d.businessName }),
    html: layout({ heading, intro, rows: [], footer }),
    text: textVersion(heading, intro, [], undefined, footer),
  };
}
