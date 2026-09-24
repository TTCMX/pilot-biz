import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

/** Normalize any user-typed phone to E.164 using the business country as default. */
export function toE164(input: string | null | undefined, defaultCountry: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry.toUpperCase() as CountryCode);
  if (parsed && parsed.isPossible()) return parsed.number;
  const digits = trimmed.replace(/[^\d+]/g, "");
  return /^\+\d{7,15}$/.test(digits) ? digits : null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

/** wa.me link (opens WhatsApp manually — no automation). */
export function whatsappLink(e164: string | null | undefined, text: string): string | null {
  if (!e164) return null;
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
