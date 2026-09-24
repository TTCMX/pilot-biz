"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/Modal";
import { deleteService, saveService } from "@/app/actions/catalog";
import type { MessageKey } from "@/lib/i18n";
import type { Service } from "@/lib/types";
import { Icon } from "@/components/Icon";

type StaffLite = { id: string; name: string; color: string | null };

export function ServicesView({ services, staff, links, currency }: { services: Service[]; staff: StaffLite[]; links: { staff_id: string; service_id: string }[]; currency: string }) {
  const { t, money, duration } = useI18n();
  const [editing, setEditing] = useState<Service | "new" | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="h1 mr-auto">{t("nav.services")}</h1>
        <button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="add" size={16} />{t("service.add")}</button>
      </div>
      {services.length === 0 && <div className="card muted text-center">{t("services.empty")}</div>}
      <ul className="space-y-2">
        {services.map((s) => {
          const who = links.filter((l) => l.service_id === s.id).map((l) => staff.find((st) => st.id === l.staff_id)?.name).filter(Boolean);
          return (
            <li key={s.id}>
              <button className={`card flex w-full items-center gap-4 text-left transition-shadow hover:shadow-float ${s.active ? "" : "opacity-50"}`} onClick={() => setEditing(s)}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Icon name="cut" size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-stone-900">{s.name} {!s.active && <span className="chip bg-stone-100 text-stone-500">{t("common.inactive")}</span>}</div>
                  <div className="text-sm text-stone-500">
                    {duration(s.duration_minutes)}
                    {s.buffer_minutes > 0 && ` + ${duration(s.buffer_minutes)} ${t("service.buffer_short")}`}
                    {staff.length > 1 && ` · ${who.length ? who.join(", ") : t("service.all_staff")}`}
                  </div>
                </div>
                <div className="text-lg font-normal tabular-nums text-stone-900">{money(s.price, s.currency)}</div>
                <Icon name="chevronRight" size={22} className="text-stone-400" />
              </button>
            </li>
          );
        })}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("service.add") : t("common.edit")}>
        {editing && (
          <ServiceForm
            service={editing === "new" ? null : editing}
            staff={staff}
            assigned={editing === "new" ? staff.map((s) => s.id) : links.filter((l) => l.service_id === editing.id).map((l) => l.staff_id)}
            currency={currency}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function ServiceForm({ service, staff, assigned, currency, onDone }: { service: Service | null; staff: StaffLite[]; assigned: string[]; currency: string; onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [staffIds, setStaffIds] = useState<string[]>(assigned);

  return (
    <form
      className="space-y-3"
      action={(f) =>
        start(async () => {
          const res = await saveService(
            {
              name: String(f.get("name")),
              description: String(f.get("description") ?? ""),
              duration_minutes: Number(f.get("duration_minutes")),
              buffer_minutes: Number(f.get("buffer_minutes") || 0),
              price: Number(f.get("price")),
              category: String(f.get("category") ?? ""),
              active: f.get("active") === "on",
              staffIds,
            },
            service?.id,
          );
          if (!res.ok) return setError(t(res.error as MessageKey));
          router.refresh();
          onDone();
        })
      }
    >
      <div>
        <label className="label">{t("service.name")}</label>
        <input className="input" name="name" defaultValue={service?.name} required autoFocus />
      </div>
      <div>
        <label className="label">{t("service.description")}</label>
        <textarea className="input" name="description" rows={2} defaultValue={service?.description ?? ""} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">{t("service.duration_minutes")}</label>
          <input className="input" name="duration_minutes" type="number" min={5} step={5} defaultValue={service?.duration_minutes ?? 60} required />
        </div>
        <div>
          <label className="label">{t("service.buffer")}</label>
          <input className="input" name="buffer_minutes" type="number" min={0} step={5} defaultValue={service?.buffer_minutes ?? 0} />
        </div>
        <div>
          <label className="label">{t("service.price")} ({currency})</label>
          <input className="input" name="price" type="number" min={0} step="any" defaultValue={service?.price ?? 0} required />
        </div>
      </div>
      <div>
        <label className="label">{t("service.category")}</label>
        <input className="input" name="category" defaultValue={service?.category ?? ""} />
      </div>
      {staff.length > 1 && (
        <fieldset>
          <legend className="label">{t("service.who_performs")}</legend>
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => (
              <label key={s.id} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${staffIds.includes(s.id) ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}>
                <input type="checkbox" className="accent-brand-600" checked={staffIds.includes(s.id)} onChange={(e) => setStaffIds(e.target.checked ? [...staffIds, s.id] : staffIds.filter((x) => x !== s.id))} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" className="accent-brand-600" defaultChecked={service?.active ?? true} />
        {t("service.active")}
      </label>
      {error && <p className="text-sm text-bad-700">{error}</p>}
      <div className="flex gap-2">
        {service && (
          <button
            type="button"
            className="btn-danger"
            disabled={pending}
            onClick={() => confirm(t("service.delete_confirm")) && start(async () => { await deleteService(service.id); router.refresh(); onDone(); })}
          >
            {t("common.delete")}
          </button>
        )}
        <button className="btn-primary flex-1" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</button>
      </div>
    </form>
  );
}
