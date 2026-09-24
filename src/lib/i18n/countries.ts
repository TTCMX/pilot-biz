// Country defaults used to infer currency, timezone, locale and phone prefix.
// Adding a country = adding one entry here. Nothing else is country-specific.

export type CountryConfig = {
  code: string; // ISO 3166-1 alpha-2
  currency: string; // ISO 4217
  languages: string[]; // preferred UI languages, first = default
  timezones: string[]; // IANA, first = default
  weekStart: 1 | 6 | 7; // ISO weekday: 1 = Monday, 6 = Saturday, 7 = Sunday
  phoneCode: string;
};

export const COUNTRIES: CountryConfig[] = [
  { code: "MX", currency: "MXN", languages: ["es"], timezones: ["America/Mexico_City", "America/Monterrey", "America/Cancun", "America/Chihuahua", "America/Hermosillo", "America/Mazatlan", "America/Tijuana"], weekStart: 7, phoneCode: "52" },
  { code: "US", currency: "USD", languages: ["en", "es"], timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"], weekStart: 7, phoneCode: "1" },
  { code: "CA", currency: "CAD", languages: ["en"], timezones: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns", "America/Regina"], weekStart: 7, phoneCode: "1" },
  { code: "IL", currency: "ILS", languages: ["en"], timezones: ["Asia/Jerusalem"], weekStart: 7, phoneCode: "972" },
  { code: "ES", currency: "EUR", languages: ["es"], timezones: ["Europe/Madrid", "Atlantic/Canary"], weekStart: 1, phoneCode: "34" },
  { code: "AR", currency: "ARS", languages: ["es"], timezones: ["America/Argentina/Buenos_Aires"], weekStart: 1, phoneCode: "54" },
  { code: "CO", currency: "COP", languages: ["es"], timezones: ["America/Bogota"], weekStart: 1, phoneCode: "57" },
  { code: "CL", currency: "CLP", languages: ["es"], timezones: ["America/Santiago"], weekStart: 1, phoneCode: "56" },
  { code: "PE", currency: "PEN", languages: ["es"], timezones: ["America/Lima"], weekStart: 7, phoneCode: "51" },
  { code: "UY", currency: "UYU", languages: ["es"], timezones: ["America/Montevideo"], weekStart: 1, phoneCode: "598" },
  { code: "EC", currency: "USD", languages: ["es"], timezones: ["America/Guayaquil"], weekStart: 1, phoneCode: "593" },
  { code: "GT", currency: "GTQ", languages: ["es"], timezones: ["America/Guatemala"], weekStart: 7, phoneCode: "502" },
  { code: "CR", currency: "CRC", languages: ["es"], timezones: ["America/Costa_Rica"], weekStart: 1, phoneCode: "506" },
  { code: "PA", currency: "USD", languages: ["es"], timezones: ["America/Panama"], weekStart: 7, phoneCode: "507" },
  { code: "DO", currency: "DOP", languages: ["es"], timezones: ["America/Santo_Domingo"], weekStart: 7, phoneCode: "1" },
  { code: "PR", currency: "USD", languages: ["es", "en"], timezones: ["America/Puerto_Rico"], weekStart: 7, phoneCode: "1" },
  { code: "BR", currency: "BRL", languages: ["en"], timezones: ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza"], weekStart: 7, phoneCode: "55" },
  { code: "GB", currency: "GBP", languages: ["en"], timezones: ["Europe/London"], weekStart: 1, phoneCode: "44" },
  { code: "IE", currency: "EUR", languages: ["en"], timezones: ["Europe/Dublin"], weekStart: 1, phoneCode: "353" },
  { code: "FR", currency: "EUR", languages: ["en"], timezones: ["Europe/Paris"], weekStart: 1, phoneCode: "33" },
  { code: "DE", currency: "EUR", languages: ["en"], timezones: ["Europe/Berlin"], weekStart: 1, phoneCode: "49" },
  { code: "IT", currency: "EUR", languages: ["en"], timezones: ["Europe/Rome"], weekStart: 1, phoneCode: "39" },
  { code: "PT", currency: "EUR", languages: ["en"], timezones: ["Europe/Lisbon", "Atlantic/Azores"], weekStart: 1, phoneCode: "351" },
  { code: "NL", currency: "EUR", languages: ["en"], timezones: ["Europe/Amsterdam"], weekStart: 1, phoneCode: "31" },
  { code: "AU", currency: "AUD", languages: ["en"], timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth"], weekStart: 1, phoneCode: "61" },
  { code: "AE", currency: "AED", languages: ["en"], timezones: ["Asia/Dubai"], weekStart: 1, phoneCode: "971" },
];

export const SUPPORTED_LANGUAGES = ["es", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function isLanguage(value: string | null | undefined): value is Language {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function getCountry(code: string | null | undefined): CountryConfig | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

/**
 * Derive everything that should not be asked to the owner.
 * browserTimezone is used when it belongs to the chosen country (multi-timezone countries).
 */
export function inferBusinessSettings(countryCode: string, opts: { browserTimezone?: string; language?: string } = {}) {
  const country = getCountry(countryCode);
  if (!country) throw new Error(`Unsupported country: ${countryCode}`);
  const language: Language = isLanguage(opts.language) && country.languages.includes(opts.language)
    ? opts.language
    : isLanguage(country.languages[0]) ? country.languages[0] : "en";
  const timezone = opts.browserTimezone && country.timezones.includes(opts.browserTimezone)
    ? opts.browserTimezone
    : country.timezones[0];
  return {
    country: country.code,
    currency: country.currency,
    timezone,
    language,
    locale: `${language}-${country.code}`,
    weekStart: country.weekStart,
    phoneCode: country.phoneCode,
  };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
