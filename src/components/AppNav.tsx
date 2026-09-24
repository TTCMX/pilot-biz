"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import type { MessageKey } from "@/lib/i18n";

const ITEMS: { href: string; key: MessageKey; icon: string; mobile: boolean }[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: "🏠", mobile: true },
  { href: "/calendar", key: "nav.calendar", icon: "📅", mobile: true },
  { href: "/customers", key: "nav.customers", icon: "👥", mobile: true },
  { href: "/waitlist", key: "nav.waitlist", icon: "⏳", mobile: true },
  { href: "/services", key: "nav.services", icon: "💅", mobile: false },
  { href: "/staff", key: "nav.staff", icon: "🧑‍💼", mobile: false },
  { href: "/settings", key: "nav.settings", icon: "⚙️", mobile: true },
];

export function AppNav({ businessName, slug }: { businessName: string; slug: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-stone-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <div className="text-xl font-bold text-brand-600">Pilot</div>
          <div className="truncate text-sm text-stone-500">{businessName}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${active(item.href) ? "bg-brand-50 text-brand-700" : "text-stone-700 hover:bg-stone-100"}`}
            >
              <span>{item.icon}</span>
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <a href={`/${slug}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm mb-2">↗ {t("nav.booking_page")}</a>
        <form action="/auth/signout" method="post">
          <button className="btn-ghost btn-sm w-full">{t("nav.sign_out")}</button>
        </form>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {ITEMS.filter((i) => i.mobile).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active(item.href) ? "text-brand-600" : "text-stone-500"}`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {t(item.key)}
          </Link>
        ))}
      </nav>
    </>
  );
}
