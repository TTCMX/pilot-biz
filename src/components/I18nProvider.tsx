"use client";

import { createContext, useContext, useMemo } from "react";
import { translate, type MessageKey, type Messages, type Vars } from "@/lib/i18n";
import { formatDate, formatDateTime, formatDuration, formatMoney, formatTime } from "@/lib/i18n/format";

type Ctx = {
  messages: Messages;
  locale: string;
  timezone: string;
  currency: string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children, ...value }: Ctx & { children: React.ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return useMemo(() => {
    const f = { locale: ctx.locale, timezone: ctx.timezone };
    return {
      ...ctx,
      t: (key: MessageKey, vars?: Vars) => translate(ctx.messages, key, vars),
      money: (amount: number, currency = ctx.currency) => formatMoney(amount, currency, ctx.locale),
      time: (iso: string) => formatTime(iso, f),
      date: (iso: string, opts?: Intl.DateTimeFormatOptions) => formatDate(iso, f, opts),
      dateTime: (iso: string) => formatDateTime(iso, f),
      duration: (m: number) => formatDuration(m, ctx.locale),
    };
  }, [ctx]);
}
