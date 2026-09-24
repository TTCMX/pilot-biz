"use client";

import { useState } from "react";
import { mapCustomerRows, parseCsv, type ImportedCustomer } from "@/lib/csv";
import { importCustomers } from "@/app/actions/customers";
import { useI18n } from "@/components/I18nProvider";
import type { MessageKey } from "@/lib/i18n";

export function CsvImport({ onDone }: { onDone?: (r: { imported: number; skipped: number }) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ImportedCustomer[] | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    const parsed = mapCustomerRows(parseCsv(await file.text()));
    if (!parsed.length) setError(t("import.empty"));
    setRows(parsed);
  }

  async function submit() {
    if (!rows?.length) return;
    setPending(true);
    const res = await importCustomers(rows);
    setPending(false);
    if (!res.ok) return setError(t(res.error as MessageKey) ?? res.error);
    setResult(t("import.done", { imported: res.data.imported, skipped: res.data.skipped }));
    setRows(null);
    onDone?.(res.data);
  }

  return (
    <div className="space-y-3">
      <p className="muted">{t("import.help")}</p>
      <input
        type="file"
        accept=".csv,text/csv"
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {rows && rows.length > 0 && (
        <div className="rounded-xl border border-stone-200">
          <p className="border-b border-stone-200 px-3 py-2 text-sm font-medium">{t("import.preview", { count: rows.length })}</p>
          <ul className="max-h-48 divide-y divide-stone-100 overflow-auto text-sm">
            {rows.slice(0, 20).map((r, i) => (
              <li key={i} className="flex justify-between gap-2 px-3 py-1.5">
                <span>{r.first_name} {r.last_name}</span>
                <span className="truncate text-stone-500">{r.phone || r.email}</span>
              </li>
            ))}
          </ul>
          <div className="p-3">
            <button className="btn-primary w-full" onClick={submit} disabled={pending}>
              {pending ? t("common.loading") : t("import.confirm", { count: rows.length })}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{result}</p>}
    </div>
  );
}
