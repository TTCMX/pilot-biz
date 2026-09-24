"use client";

import { useI18n } from "@/components/I18nProvider";
import type { AppointmentStatus } from "@/lib/types";

export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-sky-100 text-sky-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-700 line-through",
  no_show: "bg-amber-100 text-amber-800",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useI18n();
  return <span className={`chip ${STATUS_STYLES[status]}`}>{t(`status.${status}`)}</span>;
}
