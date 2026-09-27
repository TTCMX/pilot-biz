"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { cancelPublicBooking, reschedulePublicBooking } from "@/app/actions/public";
import { SlotPicker } from "../../BookingFlow";
import { formatPhone } from "@/lib/phone";
import type { MessageKey } from "@/lib/i18n";
import { HeroShapes, Icon } from "@/components/Icon";
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

  const longDate = (iso: string) => date(iso, { weekday: "long", day: "numeric", month: "long" });
  const name = appt.customer?.first_name ?? "";
  // Brand gesture: the guest's name is the one italic word on the screen.
  const [before, after] = t("booking.confirmed_title", { name: "\u0000" }).split("\u0000");

  return (
    <div className="space-y-3 px-5 pb-12 pt-2 sm:px-6">
      {isNew && appt.status !== "cancelled" && (
        <div className="card-hero">
          <HeroShapes />
          <h2 className="relative max-w-[80%] font-display text-[27px] font-light leading-[1.1]">
            {before}<em>{name}</em>{after}
          </h2>
          <p className="relative mt-3 max-w-[85%] text-[15px] leading-snug text-white/90">
            {t("booking.confirmed_subtitle", { date: longDate(appt.start_at), time: time(appt.start_at) })}
          </p>
        </div>
      )}
      {notice && <p className="flex items-center gap-2 rounded-[20px] bg-ok-100 p-4 text-sm text-ok-700"><Icon name="check" size={18} />{notice}</p>}

      <div className="rounded-[20px] bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[15px] font-semibold text-stone-900">{appt.service?.name}</div>
          <span className={`chip shrink-0 ${appt.status === "cancelled" ? "bg-bad-100 text-bad-700" : appt.status === "confirmed" ? "bg-ok-100 text-ok-700" : "bg-brand-100 text-stone-900"}`}>{t(`status.${appt.status}`)}</span>
        </div>
        <div className="mt-1 text-[15px] text-stone-900 first-letter:uppercase">{longDate(appt.start_at)} · {time(appt.start_at)}–{time(appt.end_at)}</div>
        <div className="mt-1 text-sm text-stone-500">{appt.staff?.name} · {money(Number(appt.price), appt.currency)}</div>
        {address && <div className="mt-3 flex items-center gap-2 text-sm text-stone-500"><Icon name="place" size={18} />{address}</div>}
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
        <div className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">{t("booking.pick_new_time")}</h2>
            <button className="btn-ghost btn-sm" onClick={() => setRescheduling(false)}>{t("common.cancel")}</button>
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
        <div className="rounded-[20px] bg-surface p-5">
          <p className="text-[15px] text-stone-900">{past ? t("booking.rebook_prompt") : t("booking.book_another")}</p>
          <Link href={bookAgain} className={`${past ? "btn-primary" : "btn-secondary"} mt-3 w-full`}>{t("booking.book_again")}</Link>
        </div>
      )}
      {appt.status === "cancelled" && <Link href={`/${slug}`} className="btn-primary w-full">{t("booking.book_again")}</Link>}

      {businessPhone && (
        <a href={`tel:${businessPhone}`} className="flex items-center gap-4 rounded-[20px] bg-forest p-5 text-white transition-opacity hover:opacity-95">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-white/75">
              <span className="size-2 rounded-full bg-gold" />
              {t("booking.concierge")}
            </div>
            <div className="mt-1.5 font-display text-[20px] font-light leading-tight">{t("booking.concierge_question")}</div>
            <div className="mt-1 text-sm text-white/75">{formatPhone(businessPhone)}</div>
          </div>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10" aria-hidden="true">
            <Icon name="phone" size={20} />
          </span>
        </a>
      )}

      <p className="pt-2 text-center text-xs text-stone-500">{t("booking.save_link")}</p>
    </div>
  );
}
