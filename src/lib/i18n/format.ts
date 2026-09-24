import { DateTime } from "luxon";

// All formatting goes through Intl with the business locale + timezone.

export type FormatContext = { locale: string; timezone: string; currency: string };

export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatTime(iso: string, ctx: Pick<FormatContext, "locale" | "timezone">): string {
  return new Intl.DateTimeFormat(ctx.locale, { hour: "numeric", minute: "2-digit", timeZone: ctx.timezone }).format(new Date(iso));
}

export function formatDate(iso: string, ctx: Pick<FormatContext, "locale" | "timezone">, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(ctx.locale, { ...opts, timeZone: ctx.timezone }).format(new Date(iso));
}

export function formatDateTime(iso: string, ctx: Pick<FormatContext, "locale" | "timezone">): string {
  return new Intl.DateTimeFormat(ctx.locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: ctx.timezone }).format(new Date(iso));
}

/** Format a local calendar date ("YYYY-MM-DD") without timezone shifting. */
export function formatLocalDate(date: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  const d = DateTime.fromISO(date, { zone: "UTC" });
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(d.toJSDate());
}

/** Format a local wall time ("HH:mm[:ss]") in the locale's style. */
export function formatWallTime(time: string, locale: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m));
}

export function weekdayName(isoWeekday: number, locale: string, style: "long" | "short" = "long"): string {
  // 2024-01-01 was a Monday
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(Date.UTC(2024, 0, isoWeekday));
}

export function formatDuration(minutes: number, locale: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  try {
    if (h) parts.push(new Intl.NumberFormat(locale, { style: "unit", unit: "hour", unitDisplay: "narrow" }).format(h));
    if (m || !h) parts.push(new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "narrow" }).format(m));
  } catch {
    return `${minutes} min`;
  }
  return parts.join(" ");
}

/** Today's local date in a timezone. */
export function todayIn(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate()!;
}

export function localDateOf(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone).toISODate()!;
}

export function localTimeOf(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone).toFormat("HH:mm");
}

/** Local date + local time in the business timezone → ISO UTC instant. */
export function zonedToUtc(date: string, time: string, timezone: string): string {
  return DateTime.fromISO(`${date}T${time.slice(0, 5)}`, { zone: timezone }).toUTC().toISO()!;
}

/** UTC bounds of a local day. */
export function dayBounds(date: string, timezone: string): { start: string; end: string } {
  const d = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  return { start: d.toUTC().toISO()!, end: d.plus({ days: 1 }).toUTC().toISO()! };
}
