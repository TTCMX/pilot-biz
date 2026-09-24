"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/Modal";
import { CsvImport } from "@/components/CsvImport";
import { CustomerForm } from "@/components/CustomerForm";
import { formatPhone } from "@/lib/phone";
import { SEGMENTS, type Segment } from "@/lib/metrics/customers";
import type { Customer, CustomerStats } from "@/lib/types";

type Row = Customer & { stats: CustomerStats | null; segments: Segment[] };

export function CustomersView({ customers, counts, segment, q, openNew }: { customers: Row[]; counts: Record<Segment, number>; segment: Segment; q: string; openNew: boolean }) {
  const { t, money, date } = useI18n();
  const router = useRouter();
  const [creating, setCreating] = useState(openNew);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState(q);

  const go = (params: { segment?: string; q?: string }) => {
    const sp = new URLSearchParams();
    const seg = params.segment ?? segment;
    const query = params.q ?? search;
    if (seg !== "all") sp.set("segment", seg);
    if (query) sp.set("q", query);
    router.push(`/customers${sp.size ? `?${sp}` : ""}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="h1 mr-auto">{t("nav.customers")}</h1>
        <button className="btn-secondary btn-sm" onClick={() => setImporting(true)}>{t("customers.import")}</button>
        <button className="btn-primary btn-sm" onClick={() => setCreating(true)}>+ {t("customer.new")}</button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); go({}); }}>
        <input className="input" placeholder={t("customer.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {SEGMENTS.map((s) => (
          <button
            key={s}
            onClick={() => go({ segment: s })}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${segment === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-200 bg-white text-stone-600"}`}
          >
            {t(`segment.${s}`)} <span className="text-stone-400">{counts[s]}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-stone-500">{t(`segment.${segment}_hint`)}</p>

      {customers.length === 0 ? (
        <div className="card text-center">
          <p className="muted">{t("customers.empty")}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="card block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.first_name} {c.last_name}</span>
                    {c.segments.includes("vip") && <span className="chip bg-amber-100 text-amber-800">VIP</span>}
                  </div>
                  <div className="mt-1 text-sm text-stone-500">
                    {t("customer.visits", { count: c.stats?.visit_count ?? 0 })}
                    {c.stats?.last_visit && ` · ${t("customer.last_visit")}: ${date(c.stats.last_visit)}`}
                  </div>
                  {c.stats?.next_appointment && <div className="text-sm text-brand-700">{t("customer.next_appointment")}: {date(c.stats.next_appointment)}</div>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 text-left text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("customer.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("customer.last_visit")}</th>
                  <th className="px-4 py-3 font-medium">{t("customer.next_appointment")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("customer.visit_count")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("customer.average_ticket")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {customers.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-stone-50" onClick={() => router.push(`/customers/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {c.first_name} {c.last_name}
                        {c.segments.includes("vip") && <span className="chip ml-2 bg-amber-100 text-amber-800">VIP</span>}
                      </div>
                      <div className="text-xs text-stone-400">{formatPhone(c.phone) || c.email}</div>
                    </td>
                    <td className="px-4 py-3">{c.stats?.last_visit ? date(c.stats.last_visit) : "—"}</td>
                    <td className="px-4 py-3">{c.stats?.next_appointment ? date(c.stats.next_appointment) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.stats?.visit_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.stats?.visit_count ? money(Number(c.stats.average_ticket)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={t("customer.new")}>
        <CustomerForm onSaved={(id) => { setCreating(false); router.push(`/customers/${id}`); }} />
      </Modal>
      <Modal open={importing} onClose={() => setImporting(false)} title={t("customers.import")}>
        <CsvImport onDone={() => router.refresh()} />
      </Modal>
    </div>
  );
}
