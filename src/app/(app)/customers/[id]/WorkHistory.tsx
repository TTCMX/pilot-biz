"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { PhotoGrid, PhotoUploadButton } from "@/components/Photos";
import { deletePhoto, finishPhotoUpload, setPhotoPublished, startPhotoUpload } from "@/app/actions/photos";
import type { Photo } from "@/lib/photos";
import type { HistoryRow } from "./CustomerProfile";

/** The customer's photo history, grouped by visit: references she sent and the finished work. */
export function WorkHistory({ photos, history }: { photos: Photo[]; history: HistoryRow[] }) {
  const { t, date } = useI18n();
  const router = useRouter();
  const [, run] = useTransition();
  const now = new Date().toISOString();
  const visits = history.filter((a) => a.status !== "cancelled");
  const [target, setTarget] = useState(visits.find((a) => a.start_at <= now)?.id ?? visits[0]?.id ?? "");

  const byVisit = new Map<string, Photo[]>();
  for (const p of photos) {
    const key = p.appointment_id ?? "none";
    byVisit.set(key, [...(byVisit.get(key) ?? []), p]);
  }
  const groups = [...byVisit.entries()].map(([id, list]) => ({ id, visit: history.find((a) => a.id === id), list }));
  const remove = (id: string) => run(async () => { await deletePhoto(id); router.refresh(); });
  const publish = (id: string, published: boolean) => run(async () => { await setPhotoPublished(id, published); router.refresh(); });

  return (
    <section className="card space-y-4">
      <h2 className="h2">{t("photos.history")}</h2>
      {groups.length === 0 && <p className="muted">{t("photos.history_empty")}</p>}
      {groups.map(({ id, visit, list }) => {
        const refs = list.filter((p) => p.kind === "reference");
        const results = list.filter((p) => p.kind === "result");
        return (
          <div key={id} className="space-y-2 border-t border-brand-100 pt-4 first:border-t-0 first:pt-0">
            <div className="text-sm text-stone-500 first-letter:uppercase">
              {visit ? `${date(visit.start_at, { day: "numeric", month: "long", year: "numeric" })} · ${visit.service?.name ?? ""}` : date(list[0].created_at)}
            </div>
            {results.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs text-stone-500">{t("photos.result")}</div>
                <PhotoGrid photos={results} onDelete={remove} onTogglePublish={publish} />
              </div>
            )}
            {refs.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs text-stone-500">{t("photos.from_customer")}</div>
                <PhotoGrid photos={refs} size="sm" onDelete={remove} />
              </div>
            )}
          </div>
        );
      })}
      {visits.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-brand-100 pt-4">
          <select className="input h-11 w-auto max-w-full" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t("appointment.when")}>
            {visits.slice(0, 30).map((a) => (
              <option key={a.id} value={a.id}>
                {date(a.start_at, { day: "numeric", month: "short", year: "numeric" })} · {a.service?.name}
              </option>
            ))}
          </select>
          {target && (
            <PhotoUploadButton
              key={target}
              label={t("photos.add_result")}
              start={(types) => startPhotoUpload(target, "result", types)}
              finish={(paths) => finishPhotoUpload(target, "result", paths)}
              onDone={() => router.refresh()}
            />
          )}
        </div>
      )}
    </section>
  );
}
