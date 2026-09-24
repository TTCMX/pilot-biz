"use client";

import { useI18n } from "@/components/I18nProvider";
import { weekdayName } from "@/lib/i18n/format";
import type { WeeklyHours } from "@/app/actions/onboarding";

export const DEFAULT_HOURS: WeeklyHours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  open: day <= 6,
  start: "09:00",
  end: day === 6 ? "15:00" : "19:00",
}));

/** Build the editor value from stored rules (first range per day). */
export function hoursFromRules(rules: { day_of_week: number; start_time: string; end_time: string }[]): WeeklyHours {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const r = rules.find((x) => x.day_of_week === day);
    return r ? { day, open: true, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) } : { day, open: false, start: "09:00", end: "18:00" };
  });
}

export function WeeklyHoursEditor({ value, onChange, weekStart = 1 }: { value: WeeklyHours; onChange: (v: WeeklyHours) => void; weekStart?: number }) {
  const { t, locale } = useI18n();
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => ((weekStart - 1 + i) % 7) + 1);
  const update = (day: number, patch: Partial<WeeklyHours[number]>) => onChange(value.map((d) => (d.day === day ? { ...d, ...patch } : d)));

  return (
    <div className="divide-y divide-stone-100">
      {order.map((dayNum) => {
        const d = value.find((x) => x.day === dayNum)!;
        return (
          <div key={d.day} className="flex flex-wrap items-center gap-3 py-2.5">
            <label className="flex w-36 items-center gap-2 text-sm font-medium capitalize">
              <input type="checkbox" className="size-4 accent-brand-600" checked={d.open} onChange={(e) => update(d.day, { open: e.target.checked })} />
              {weekdayName(d.day, locale)}
            </label>
            {d.open ? (
              <div className="flex items-center gap-2">
                <input type="time" className="input w-32" value={d.start} onChange={(e) => update(d.day, { start: e.target.value })} step={900} />
                <span className="text-stone-400">–</span>
                <input type="time" className="input w-32" value={d.end} onChange={(e) => update(d.day, { end: e.target.value })} step={900} />
              </div>
            ) : (
              <span className="text-sm text-stone-400">{t("hours.closed")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
