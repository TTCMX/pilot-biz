"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useI18n } from "@/components/I18nProvider";
import { PhotoGrid, PhotoUploadButton, type PhotoView } from "@/components/Photos";
import { deletePhoto, finishPhotoUpload, getAppointmentPhotos, setPhotoPublished, startPhotoUpload } from "@/app/actions/photos";

/** Owner view of one appointment's photos: the customer's references and the finished work. */
export function AppointmentPhotos({ appointmentId }: { appointmentId: string }) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<PhotoView[] | null>(null);
  const [, run] = useTransition();

  const load = useCallback(() => {
    getAppointmentPhotos(appointmentId).then((r) => setPhotos(r.ok ? r.data : []));
  }, [appointmentId]);
  useEffect(load, [load]);

  const references = photos?.filter((p) => p.kind === "reference") ?? [];
  const results = photos?.filter((p) => p.kind === "result") ?? [];
  const remove = (id: string) => run(async () => { await deletePhoto(id); load(); });
  const publish = (id: string, published: boolean) => run(async () => { await setPhotoPublished(id, published); load(); });

  return (
    <div className="space-y-3 rounded-[20px] bg-stone-100/70 p-4">
      <div className="text-[15px] font-semibold text-stone-900">{t("photos.title")}</div>
      {photos === null ? (
        <p className="muted">{t("common.loading")}</p>
      ) : (
        <>
          {references.length > 0 && (
            <div>
              <div className="mb-2 text-sm text-stone-500">{t("photos.from_customer")}</div>
              <PhotoGrid photos={references} size="sm" onDelete={remove} />
            </div>
          )}
          <div>
            <div className="mb-2 text-sm text-stone-500">{t("photos.result")}</div>
            {results.length ? <PhotoGrid photos={results} size="sm" onDelete={remove} onTogglePublish={publish} /> : <p className="muted">{t("photos.empty")}</p>}
          </div>
          <PhotoUploadButton
            label={t("photos.add_result")}
            start={(types) => startPhotoUpload(appointmentId, "result", types)}
            finish={(paths) => finishPhotoUpload(appointmentId, "result", paths)}
            onDone={load}
          />
        </>
      )}
    </div>
  );
}
