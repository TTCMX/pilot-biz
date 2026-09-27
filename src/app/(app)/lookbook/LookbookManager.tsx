"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { Icon } from "@/components/Icon";
import { PhotoUploadButton } from "@/components/Photos";
import { deletePhoto, finishPortfolioUpload, setPhotoPublished, setPhotoService, startPortfolioUpload } from "@/app/actions/photos";
import type { Photo } from "@/lib/photos";

type Service = { id: string; name: string };

/** The business curates what its booking page shows: upload work, pick the service, show or hide. */
export function LookbookManager({ services, photos, bookingPath }: { services: Service[]; photos: Photo[]; bookingPath: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const shown = photos.filter((p) => p.published);
  const hidden = photos.filter((p) => !p.published);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end gap-3 pb-2 pt-4 md:pt-2">
        <div className="mr-auto max-w-2xl">
          <h1 className="h1">{t("lookbook.title")}</h1>
          <p className="mt-2 text-[15px] text-stone-500">{t("lookbook.subtitle")}</p>
        </div>
        <a href={bookingPath} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><Icon name="openInNew" size={16} />{t("lookbook.view_page")}</a>
      </header>

      <section className="card-hero">
        <div className="relative max-w-xl">
          <h2 className="font-display text-[22px] font-light">{t("lookbook.upload_title")}</h2>
          <p className="mt-1 text-sm text-white/85">{t("lookbook.upload_hint")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              className="h-11 max-w-full rounded-full border border-white/30 bg-white/10 px-4 text-[15px] text-white focus:outline-none [&>option]:text-stone-900"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              aria-label={t("lookbook.service")}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {serviceId && (
              <PhotoUploadButton
                key={serviceId}
                label={t("lookbook.upload")}
                className="btn h-11 bg-white font-semibold text-brand-700 hover:bg-brand-50"
                start={(types) => startPortfolioUpload(serviceId, types)}
                finish={(paths) => finishPortfolioUpload(serviceId, paths)}
                onDone={() => router.refresh()}
              />
            )}
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="h2">{t("lookbook.on_page")}</h2>
        {shown.length ? <LookGrid photos={shown} services={services} /> : <p className="muted">{t("lookbook.on_page_empty")}</p>}
      </section>

      {hidden.length > 0 && (
        <section className="card space-y-4">
          <div>
            <h2 className="h2">{t("lookbook.from_appointments")}</h2>
            <p className="muted mt-1">{t("lookbook.from_appointments_hint")}</p>
          </div>
          <LookGrid photos={hidden} services={services} />
        </section>
      )}
    </div>
  );
}

function LookGrid({ photos, services }: { photos: Photo[]; services: Service[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((p) => (
        <LookTile key={p.id} photo={p} services={services} />
      ))}
    </div>
  );
}

function LookTile({ photo, services }: { photo: Photo; services: Service[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, run] = useTransition();
  const act = (fn: () => Promise<unknown>) => run(async () => { await fn(); router.refresh(); });
  const known = services.some((s) => s.id === photo.service_id);

  return (
    <div className={`space-y-2 ${pending ? "opacity-60" : ""}`}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-stone-100">
        <a href={photo.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" loading="lazy" className="size-full object-cover" />
        </a>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => setPhotoPublished(photo.id, !photo.published))}
          aria-pressed={photo.published}
          aria-label={photo.published ? t("photos.unpublish") : t("photos.publish")}
          className={`absolute bottom-2 left-2 flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${photo.published ? "bg-brand-600 text-white" : "bg-forest/60 text-white hover:bg-forest/80"}`}
        >
          <Icon name="star" size={15} className={photo.published ? "fill-current" : ""} />
          {photo.published ? t("photos.published") : t("photos.publish")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm(t("photos.delete_confirm")) && act(() => deletePhoto(photo.id))}
          aria-label={t("photos.delete")}
          className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-forest/60 text-white hover:bg-forest/80"
        >
          <Icon name="delete" size={16} />
        </button>
      </div>
      <select
        className={`input h-10 rounded-full px-3 text-sm ${known ? "" : "border-warn-700 text-warn-700"}`}
        value={known ? photo.service_id! : ""}
        disabled={pending}
        onChange={(e) => e.target.value && act(() => setPhotoService(photo.id, e.target.value))}
        aria-label={t("lookbook.service")}
      >
        {!known && <option value="">{t("lookbook.no_service")}</option>}
        {services.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
