import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestLanguage, getUser } from "@/lib/context";
import { createT } from "@/lib/i18n";
import { Icon, Logo, type IconName } from "@/components/Icon";

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  const lang = await getRequestLanguage();
  const t = createT(lang);
  const points: { icon: IconName; text: string; tone: string }[] = [
    { icon: "calendar", text: t("landing.point_calendar"), tone: "bg-brand-100 text-brand-700" },
    { icon: "link", text: t("landing.point_booking"), tone: "bg-ok-100 text-ok-700" },
    { icon: "group", text: t("landing.point_crm"), tone: "bg-warn-100 text-warn-700" },
  ];
  return (
    <main lang={lang} className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Link href="/login" className="btn-ghost">{t("auth.login")}</Link>
      </header>
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-12 text-center sm:pt-20">
        <h1 className="text-[40px] font-normal leading-[1.1] tracking-tight text-stone-900 sm:text-[56px]">{t("landing.title")}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-600">{t("landing.subtitle")}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary h-12 px-8 text-base">{t("landing.cta")}</Link>
          <Link href="/login" className="btn-secondary h-12 px-8 text-base">{t("auth.login")}</Link>
        </div>
        <p className="mt-4 text-sm text-stone-500">{t("landing.setup_time")}</p>
        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {points.map((p) => (
            <div key={p.icon} className="card">
              <span className={`flex size-12 items-center justify-center rounded-2xl ${p.tone}`}>
                <Icon name={p.icon} size={24} />
              </span>
              <p className="mt-4 text-stone-700">{p.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
