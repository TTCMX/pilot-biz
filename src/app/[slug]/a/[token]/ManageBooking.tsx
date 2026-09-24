"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { cancelPublicBooking, reschedulePublicBooking } from "@/app/actions/public";
import { SlotPicker } from "../../BookingFlow";
import { formatPhone } from "@/lib/phone";
import type { MessageKey } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
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
        <div className="flex flex-col items-center rounded-3xl bg-ok-100 p-6 text-center text-ok-700">
          <span className="flex size-14 items-center justify-center rounded-full bg-white"><Icon name="check" size={32} /></span>
          <h2 className="mt-3 text-[22px] font-normal text-stone-900">{t("booking.confirmed_title")}</h2>
          <p className="mt-1 text-sm">{t("booking.confirmed_subtitle", { name: appt.customer?.first_name ?? "" })}</p>
        </div>
      )}
      {notice && <p className="flex items-center gap-2 rounded-2xl bg-ok-100 p-4 text-sm text-ok-700"><Icon name="check" size={18} />{notice}</p>}

      <div className="rounded-2xl border border-stone-200 p-5">
        <div className="text-lg font-medium text-stone-900">{appt.service?.name}</div>
        <div className="mt-1 font-medium first-letter:uppercase text-brand-700">{date(appt.start_at, { weekday: "long", day: "numeric", month: "long" })} · {time(appt.start_at)}–{time(appt.end_at)}</div>
        <div className="mt-1 text-sm text-stone-500">{appt.staff?.name} · {money(Number(appt.price), appt.currency)}</div>
        {address && <div className="mt-3 flex items-center gap-2 text-sm text-stone-600"><Icon name="place" size={18} className="text-stone-400" />{address}</div>}
        {businessPhone && <a href={`tel:${businessPhone}`} className="mt-1 flex items-center gap-2 text-sm text-brand-700"><Icon name="phone" size={18} className="text-stone-400" />{formatPhone(businessPhone)}</a>}
        <div className="mt-3">
          <span className={`chip ${appt.status === "cancelled" ? "bg-bad-100 text-bad-700" : appt.status === "confirmed" ? "bg-ok-100 text-ok-700" : "bg-brand-100 text-brand-900"}`}>{t(`status.${appt.status}`)}</span>
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
            <h2 className="text-lg font-medium">{t("booking.pick_new_time")}</h2>
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

      {error && <p className="text-sm text-bad-700">{error}</p>}

      {(past || isNew) && appt.status !== "cancelled" && (
        <div className="rounded-3xl bg-brand-50 p-5">
          <p className="font-medium text-brand-900">{past ? t("booking.rebook_prompt") : t("booking.book_another")}</p>
          <Link href={bookAgain} className="btn-primary mt-3 w-full">{t("booking.book_again")}</Link>
        </div>
      )}
      {appt.status === "cancelled" && <Link href={`/${slug}`} className="btn-primary w-full">{t("booking.book_again")}</Link>}

      <p className="text-center text-xs text-stone-400">{t("booking.save_link")}</p>
    </div>
  );
}
