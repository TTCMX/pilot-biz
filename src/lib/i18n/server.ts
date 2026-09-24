import "server-only";
import { getMessages } from "@/lib/i18n";
import type { Business } from "@/lib/types";

/** Props for <I18nProvider> from a business (or a bare language before one exists). */
export function i18nProps(source: Pick<Business, "language" | "locale" | "timezone" | "currency"> | { language: string }) {
  const full = "locale" in source ? source : { language: source.language, locale: source.language, timezone: "UTC", currency: "USD" };
  return { messages: getMessages(full.language), locale: full.locale, timezone: full.timezone, currency: full.currency };
}
