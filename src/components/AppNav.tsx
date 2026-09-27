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
  { href: "/lookbook", key: "nav.lookbook", icon: "gallery", mobile: false },
  { href: "/settings", key: "nav.settings", icon: "settings", mobile: true },
];

export function AppNav({ businessName, slug }: { businessName: string; slug: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop navigation drawer */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col px-4 py-6 md:flex">
        <Link href="/dashboard" className="mb-6 px-3">
          <Logo />
        </Link>
        <Link href="/calendar?new=1" className="btn-fab mb-6 self-start">
          <Icon name="add" size={22} />
          {t("dashboard.new_appointment")}
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={`flex h-11 items-center gap-4 rounded-full px-4 text-[15px] transition-colors ${
                active(item.href) ? "bg-nav font-medium text-nav-on" : "text-stone-500 hover:bg-surface hover:text-stone-900"
              }`}
            >
              <Icon name={item.icon} size={20} />
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t border-brand-200 pt-4">
          <div className="truncate px-4 pb-1 text-sm text-stone-500">{businessName}</div>
          <a href={`/${slug}`} target="_blank" rel="noreferrer" className="flex h-11 items-center gap-4 rounded-full px-4 text-[15px] text-stone-500 hover:bg-surface hover:text-stone-900">
            <Icon name="openInNew" size={20} />
            {t("nav.booking_page")}
          </a>
          <form action="/auth/signout" method="post">
            <button className="flex h-11 w-full items-center gap-4 rounded-full px-4 text-[15px] text-stone-500 hover:bg-surface hover:text-stone-900">
              <Icon name="logout" size={20} />
              {t("nav.sign_out")}
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar: brand and quick link to the booking page */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-mist/95 px-5 backdrop-blur md:hidden">
        <Logo withName={false} />
        <span className="min-w-0 flex-1 truncate font-display text-[20px] font-light text-stone-900">{businessName}</span>
        <a href={`/${slug}`} target="_blank" rel="noreferrer" className="icon-btn" aria-label={t("nav.booking_page")}>
          <Icon name="openInNew" size={20} />
        </a>
      </header>

      {/* Mobile floating navigation: the active item shows icon and label on Brote, the rest only the icon */}
      <nav className="fixed inset-x-5 bottom-[calc(22px+env(safe-area-inset-bottom))] z-30 flex h-[66px] items-center justify-between rounded-full bg-surface px-2.5 shadow-float md:hidden">
        {ITEMS.filter((i) => i.mobile).map((item) => {
          const on = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={t(item.key)}
              aria-current={on ? "page" : undefined}
              className={`flex h-11 items-center justify-center gap-2 rounded-full transition-colors ${on ? "bg-nav px-3.5 text-nav-on" : "w-11 text-stone-500"}`}
            >
              <Icon name={item.icon} size={22} />
              {on && <span className="text-sm font-medium">{t(item.key)}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
