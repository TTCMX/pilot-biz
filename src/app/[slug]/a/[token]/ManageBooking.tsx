"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { cancelPublicBooking, reschedulePublicBooking } from "@/app/actions/public";
import { SlotPicker } from "../../BookingFlow";
import { formatPhone } from "@/lib/phone";
import type { MessageKey } from "@/lib/i18n";
import type { AppointmentStatus } from "@/lib/types";

type Appt = {
  start_at: string; end_at: string; status: AppointmentStatus; price: number; currency: string;
  service_id: string; staff_id: string; public_token: string;
  service: { name: string; duration_minutes: number } | null; staff: { name: string } | null; customer: { first_name: string } | null;
};

export function ManageBooking({ slug, isNew, appt, address, businessPhone }: { slug: string; isNew: boolean; appt: Appt; address: string; businessPhone: string | null }) {
  const { t, money, date, time } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = (appt.status === "scheduled" || appt.status === "confirmed") && Date.parse(appt.start_at) > Date.now();
  const past = appt.status === "completed" || Date.parse(appt.end_at) < Date.now();
  const bookAgain = `/${slug}?service=${appt.service_id}&staff=${appt.staff_id}&rebook=${appt.public_token}`;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(t(r.error as MessageKey));
      setNotice(success);
      setRescheduling(false);
      router.refresh();
    });

  return (
    <div className="space-y-4 px-4 pb-10 pt-5">
      {isNew && appt.status !== "cancelled" && (
        <div className="rounded-2xl bg-green-50 p-4 text-center">
          <div className="text-4xl">🎉</div>
          <h2 className="mt-1 text-xl font-bold text-green-900">{t("booking.confirmed_title")}</h2>
          <p className="text-sm text-green-800">{t("booking.confirmed_subtitle", { name: appt.customer?.first_name ?? "" })}</p>
        </div>
      )}
      {notice && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      <div className="rounded-2xl border border-stone-200 p-4">
        <div className="text-lg font-semibold">{appt.service?.name}</div>
        <div className="mt-1 font-medium first-letter:uppercase text-brand-700">{date(appt.start_at, { weekday: "long", day: "numeric", month: "long" })} · {time(appt.start_at)}–{time(appt.end_at)}</div>
        <div className="mt-1 text-sm text-stone-500">{appt.staff?.name} · {money(Number(appt.price), appt.currency)}</div>
        {address && <div className="mt-2 text-sm text-stone-500">📍 {address}</div>}
        {businessPhone && <div className="text-sm text-stone-500">📞 {formatPhone(businessPhone)}</div>}
        <div className="mt-3">
          <span className={`chip ${appt.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-700"}`}>{t(`status.${appt.status}`)}</span>
        </div>
      </div>

      {active && !rescheduling && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => setRescheduling(true)}>{t("booking.reschedule")}</button>
          <button className="btn-danger" disabled={pending} onClick={() => confirm(t("appointment.cancel_confirm")) && run(() => cancelPublicBooking(slug, appt.public_token), t("booking.cancelled_notice"))}>
            {t("booking.cancel")}
          </button>
        </div>
      )}

      {rescheduling && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{t("booking.pick_new_time")}</h2>
            <button className="text-sm text-stone-500" onClick={() => setRescheduling(false)}>{t("common.cancel")}</button>
          </div>
          <SlotPicker
            slug={slug}
            serviceId={appt.service_id}
            staffId={appt.staff_id}
            token={appt.public_token}
            value={null}
            onChange={(iso) =>
              confirm(t("booking.reschedule_confirm", { date: `${date(iso)} ${time(iso)}` })) &&
              run(() => reschedulePublicBooking(slug, appt.public_token, iso), t("booking.rescheduled_notice"))
            }
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {(past || isNew) && appt.status !== "cancelled" && (
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="font-semibold text-brand-900">{past ? t("booking.rebook_prompt") : t("booking.book_another")}</p>
          <Link href={bookAgain} className="btn-primary mt-3 w-full">{t("booking.book_again")}</Link>
        </div>
      )}
      {appt.status === "cancelled" && <Link href={`/${slug}`} className="btn-primary w-full">{t("booking.book_again")}</Link>}

      <p className="text-center text-xs text-stone-400">{t("booking.save_link")}</p>
    </div>
  );
}
