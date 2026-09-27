import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestLanguage, getUser } from "@/lib/context";
import { createT } from "@/lib/i18n";
import { HeroShapes, Icon, Logo, type IconName } from "@/components/Icon";

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  const lang = await getRequestLanguage();
  const t = createT(lang);
  const points: { icon: IconName; text: string }[] = [
    { icon: "calendar", text: t("landing.point_calendar") },
    { icon: "link", text: t("landing.point_booking") },
    { icon: "group", text: t("landing.point_crm") },
  ];
  return (
    <main lang={lang} className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-6">
        <Logo />
        <Link href="/login" className="btn-ghost">{t("auth.login")}</Link>
      </header>
      <section className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-6 sm:pt-20">
        <div className="card-hero px-7 py-12 sm:px-14 sm:py-16">
          <HeroShapes />
          <h1 className="relative max-w-2xl font-display text-[36px] font-light leading-[1.05] sm:text-[52px]">{t("landing.title")}</h1>
          <p className="relative mt-5 max-w-xl text-[17px] leading-relaxed text-white/90">{t("landing.subtitle")}</p>
          <div className="relative mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="btn h-12 bg-white px-7 font-semibold text-brand-700 hover:bg-brand-50">{t("landing.cta")}</Link>
            <Link href="/login" className="btn h-12 border border-white/40 px-7 text-white hover:bg-white/10">{t("auth.login")}</Link>
          </div>
          <p className="relative mt-4 text-sm text-white/80">{t("landing.setup_time")}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {points.map((p) => (
            <div key={p.icon} className="card">
              <Icon name={p.icon} size={22} className="text-brand-700" />
              <p className="mt-4 text-[15px] leading-relaxed text-stone-700">{p.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
