import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestLanguage, getUser } from "@/lib/context";
import { createT } from "@/lib/i18n";

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  const lang = await getRequestLanguage();
  const t = createT(lang);
  return (
    <main lang={lang} className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <div className="text-2xl font-bold text-brand-600">Pilot</div>
      <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">{t("landing.title")}</h1>
      <p className="mt-4 text-lg text-stone-600">{t("landing.subtitle")}</p>
      <ul className="mt-6 space-y-2 text-stone-700">
        <li>📅 {t("landing.point_calendar")}</li>
        <li>🔗 {t("landing.point_booking")}</li>
        <li>👥 {t("landing.point_crm")}</li>
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/signup" className="btn-primary px-6 py-3 text-base">{t("landing.cta")}</Link>
        <Link href="/login" className="btn-secondary px-6 py-3 text-base">{t("auth.login")}</Link>
      </div>
      <p className="mt-4 text-sm text-stone-500">{t("landing.setup_time")}</p>
    </main>
  );
}
