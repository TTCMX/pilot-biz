"use client";

import { useI18n } from "@/components/I18nProvider";
import type { AppointmentStatus } from "@/lib/types";

export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: "bg-brand-100 text-brand-900",
  confirmed: "bg-ok-100 text-ok-700",
  completed: "bg-stone-100 text-stone-600",
  cancelled: "bg-bad-100 text-bad-700 line-through",
  no_show: "bg-warn-100 text-warn-700",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useI18n();
  return <span className={`chip ${STATUS_STYLES[status]}`}>{t(`status.${status}`)}</span>;
}
