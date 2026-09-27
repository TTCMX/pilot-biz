"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import type { ActionResult } from "@/app/actions/result";
import type { MessageKey } from "@/lib/i18n";

// Shared photo UI: pick → shrink in the browser → upload straight to Storage
// with the signed URLs the server hands out → confirm.

export type PhotoView = { id: string; kind: "reference" | "result"; url: string; created_at?: string };
type Start = (types: string[]) => Promise<ActionResult<{ path: string; token: string }[]>>;
type Finish = (paths: string[]) => Promise<ActionResult<{ count: number }>>;

/** Downscale to at most `max` px and re-encode as JPEG; phone photos go from ~5 MB to ~300 KB. */
export async function shrinkImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob) return blob;
  } catch {
    // Fall back to the original file; the server still checks its type.
  }
  return file;
}

/** Uploads files and returns how many were saved, or an error key. */
export async function uploadPhotos(files: File[], start: Start, finish: Finish): Promise<{ count: number; error?: string }> {
  if (!files.length) return { count: 0 };
  const blobs = await Promise.all(files.map((f) => shrinkImage(f)));
  const targets = await start(blobs.map((b) => b.type));
  if (!targets.ok) return { count: 0, error: targets.error };
  const storage = createClient().storage.from("photos");
  const uploaded: string[] = [];
  await Promise.all(
    targets.data.map(async (target, i) => {
      const { error } = await storage.uploadToSignedUrl(target.path, target.token, blobs[i], { contentType: blobs[i].type });
      if (!error) uploaded.push(target.path);
    }),
  );
  if (!uploaded.length) return { count: 0, error: "errors.generic" };
  const done = await finish(uploaded);
  if (!done.ok) return { count: 0, error: done.error };
  return { count: done.data.count, error: done.data.count < files.length ? "errors.generic" : undefined };
}

/** Local selection with previews, uploaded later by the caller (used before a booking exists). */
export function PhotoPicker({ files, onChange, max }: { files: File[]; onChange: (files: File[]) => void; max: number }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div className="flex flex-wrap gap-2">
      {previews.map((src, i) => (
        <div key={src} className="relative size-20 overflow-hidden rounded-2xl bg-stone-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(files.filter((_, j) => j !== i))}
            className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-forest/70 text-white"
            aria-label={t("photos.remove")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      {files.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex size-20 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-brand-300 bg-surface text-xs text-stone-500 transition-colors hover:bg-brand-100"
        >
          <Icon name="camera" size={20} />
          {t("photos.add")}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
          onChange([...files, ...picked].slice(0, max));
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Grid of saved photos; each opens full size in a new tab. */
export function PhotoGrid({ photos, onDelete, size = "md" }: { photos: PhotoView[]; onDelete?: (id: string) => void; size?: "sm" | "md" }) {
  const { t } = useI18n();
  const box = size === "sm" ? "size-20" : "size-24 sm:size-28";
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <div key={p.id} className={`group relative ${box} overflow-hidden rounded-2xl bg-stone-100`}>
          <a href={p.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
          </a>
          {onDelete && (
            <button
              type="button"
              onClick={() => confirm(t("photos.delete_confirm")) && onDelete(p.id)}
              className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-forest/70 text-white"
              aria-label={t("photos.delete")}
            >
              <Icon name="delete" size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Button that picks photos and uploads them right away. */
export function PhotoUploadButton({ label, start, finish, onDone, className = "btn-secondary btn-sm" }: { label: string; start: Start; finish: Finish; onDone: () => void; className?: string }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button type="button" className={className} disabled={pending} onClick={() => input.current?.click()}>
        <Icon name="camera" size={18} />
        {pending ? t("photos.uploading") : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
          e.target.value = "";
          if (!files.length) return;
          run(async () => {
            setError(null);
            const r = await uploadPhotos(files, start, finish);
            if (r.error) setError(t(r.error as MessageKey));
            if (r.count) onDone();
          });
        }}
      />
      {error && <p className="mt-2 text-sm text-bad-700">{error}</p>}
    </div>
  );
}
