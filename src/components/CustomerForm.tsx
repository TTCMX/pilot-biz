"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/components/I18nProvider";
import { saveCustomer } from "@/app/actions/customers";
import type { MessageKey } from "@/lib/i18n";
import type { Customer } from "@/lib/types";

export function CustomerForm({ customer, onSaved }: { customer?: Customer; onSaved: (id: string) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-3"
      action={(form) =>
        start(async () => {
          const res = await saveCustomer(
            {
              first_name: String(form.get("first_name") ?? ""),
              last_name: String(form.get("last_name") ?? ""),
              phone: String(form.get("phone") ?? ""),
              email: String(form.get("email") ?? ""),
              notes: String(form.get("notes") ?? ""),
            },
            customer?.id,
          );
          if (!res.ok) setError(t(res.error as MessageKey));
          else onSaved(res.data.id);
        })
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("customer.first_name")}</label>
          <input className="input" name="first_name" defaultValue={customer?.first_name} required autoFocus />
        </div>
        <div>
          <label className="label">{t("customer.last_name")}</label>
          <input className="input" name="last_name" defaultValue={customer?.last_name ?? ""} />
        </div>
      </div>
      <div>
        <label className="label">{t("customer.phone")}</label>
        <input className="input" name="phone" type="tel" defaultValue={customer?.phone ?? ""} placeholder="+..." />
      </div>
      <div>
        <label className="label">{t("customer.email")}</label>
        <input className="input" name="email" type="email" defaultValue={customer?.email ?? ""} />
      </div>
      <div>
        <label className="label">{t("customer.notes")}</label>
        <textarea className="input" name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</button>
    </form>
  );
}
