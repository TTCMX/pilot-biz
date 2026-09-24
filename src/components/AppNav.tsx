"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { Icon, Logo, type IconName } from "@/components/Icon";
import type { MessageKey } from "@/lib/i18n";

const ITEMS: { href: string; key: MessageKey; icon: IconName; mobile: boolean }[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: "home", mobile: true },
  { href: "/calendar", key: "nav.calendar", icon: "calendar", mobile: true },
  { href: "/customers", key: "nav.customers", icon: "group", mobile: true },
  { href: "/waitlist", key: "nav.waitlist", icon: "hourglass", mobile: true },
  { href: "/services", key: "nav.services", icon: "cut", mobile: false },
  { href: "/staff", key: "nav.staff", icon: "team", mobile: false },
  { href: "/settings", key: "nav.settings", icon: "settings", mobile: true },
];

export function AppNav({ businessName, slug }: { businessName: string; slug: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop navigation drawer */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col px-3 py-4 md:flex">
        <Link href="/dashboard" className="mb-5 px-3">
          <Logo />
        </Link>
        <Link href="/calendar?new=1" className="btn-fab mb-5 self-start">
          <Icon name="add" size={24} />
          {t("dashboard.new_appointment")}
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-12 items-center gap-4 rounded-full px-4 text-sm transition-colors ${
                active(item.href) ? "bg-nav font-medium text-nav-on" : "text-stone-600 hover:bg-stone-200/60"
              }`}
            >
              <Icon name={item.icon} size={22} />
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t border-stone-200 pt-3">
          <div className="truncate px-4 pb-1 text-xs font-medium uppercase tracking-wide text-stone-400">{businessName}</div>
          <a href={`/${slug}`} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-4 rounded-full px-4 text-sm text-stone-600 hover:bg-stone-200/60">
            <Icon name="openInNew" size={20} />
            {t("nav.booking_page")}
          </a>
          <form action="/auth/signout" method="post">
            <button className="flex h-11 w-full items-center gap-4 rounded-full px-4 text-sm text-stone-600 hover:bg-stone-200/60">
              <Icon name="logout" size={20} />
              {t("nav.sign_out")}
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top app bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-stone-50/95 px-4 backdrop-blur md:hidden">
        <Logo withName={false} />
        <span className="min-w-0 flex-1 truncate text-lg text-stone-800">{businessName}</span>
        <a href={`/${slug}`} target="_blank" rel="noreferrer" className="icon-btn" aria-label={t("nav.booking_page")}>
          <Icon name="openInNew" size={22} />
        </a>
      </header>

      {/* Mobile navigation bar (Material 3) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-20 border-t border-stone-200 bg-stone-100 pb-[env(safe-area-inset-bottom)] md:hidden">
        {ITEMS.filter((i) => i.mobile).map((item) => {
          const on = active(item.href);
          return (
            <Link key={item.href} href={item.href} className="flex flex-1 flex-col items-center justify-center gap-1">
              <span className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors ${on ? "bg-nav text-nav-on" : "text-stone-600"}`}>
                <Icon name={item.icon} size={22} />
              </span>
              <span className={`text-xs ${on ? "font-medium text-stone-900" : "font-medium text-stone-600"}`}>{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
