// Service templates per business_type. Names are localization keys; prices are
// suggestions in USD converted with a rough per-currency factor and rounded,
// always editable by the owner. Nothing here assumes a country.

import type { MessageKey } from "@/lib/i18n";

export const BUSINESS_TYPES = ["nails", "hair", "barber", "beauty", "spa", "massage", "wellness", "aesthetics", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

type Template = { key: MessageKey; duration: number; usd: number };

const TEMPLATES: Record<BusinessType, Template[]> = {
  nails: [
    { key: "template.manicure", duration: 45, usd: 25 },
    { key: "template.gel", duration: 60, usd: 40 },
    { key: "template.pedicure", duration: 60, usd: 35 },
    { key: "template.gel_pedicure", duration: 105, usd: 70 },
  ],
  hair: [
    { key: "template.haircut", duration: 45, usd: 40 },
    { key: "template.blowdry", duration: 45, usd: 35 },
    { key: "template.color", duration: 120, usd: 90 },
    { key: "template.highlights", duration: 150, usd: 130 },
  ],
  barber: [
    { key: "template.haircut", duration: 30, usd: 25 },
    { key: "template.beard", duration: 20, usd: 15 },
    { key: "template.haircut_beard", duration: 45, usd: 35 },
  ],
  beauty: [
    { key: "template.makeup", duration: 60, usd: 60 },
    { key: "template.lashes", duration: 90, usd: 70 },
    { key: "template.brows", duration: 30, usd: 25 },
    { key: "template.waxing", duration: 30, usd: 30 },
  ],
  spa: [
    { key: "template.facial", duration: 60, usd: 70 },
    { key: "template.massage_60", duration: 60, usd: 70 },
    { key: "template.body_treatment", duration: 90, usd: 100 },
  ],
  massage: [
    { key: "template.massage_60", duration: 60, usd: 70 },
    { key: "template.massage_90", duration: 90, usd: 100 },
    { key: "template.deep_tissue", duration: 60, usd: 85 },
  ],
  wellness: [
    { key: "template.consultation", duration: 45, usd: 50 },
    { key: "template.session", duration: 60, usd: 60 },
    { key: "template.follow_up", duration: 30, usd: 35 },
  ],
  aesthetics: [
    { key: "template.consultation", duration: 30, usd: 40 },
    { key: "template.facial", duration: 60, usd: 80 },
    { key: "template.peel", duration: 45, usd: 100 },
  ],
  other: [
    { key: "template.consultation", duration: 30, usd: 40 },
    { key: "template.session", duration: 60, usd: 60 },
  ],
};

// Rough purchasing-level factors for suggested prices only (not exchange rates).
const PRICE_FACTOR: Record<string, number> = {
  USD: 1, CAD: 1.3, MXN: 12, EUR: 0.9, GBP: 0.8, ILS: 3.5, ARS: 900, COP: 3000, CLP: 700, PEN: 2.5,
  UYU: 30, GTQ: 6, CRC: 350, DOP: 40, BRL: 4, AUD: 1.4, AED: 3.5,
};

function roundNice(n: number): number {
  if (n < 10) return Math.round(n);
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  const step = magnitude * 5;
  return Math.round(n / step) * step;
}

export function serviceTemplates(type: string, currency: string) {
  const list = TEMPLATES[(type as BusinessType)] ?? TEMPLATES.other;
  const factor = PRICE_FACTOR[currency] ?? 1;
  return list.map((t) => ({ nameKey: t.key, duration_minutes: t.duration, price: roundNice(t.usd * factor) }));
}

export const STAFF_COLORS = ["#e11d48", "#7c3aed", "#0891b2", "#059669", "#d97706", "#db2777", "#2563eb", "#65a30d"];
