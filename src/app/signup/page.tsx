import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { I18nProvider } from "@/components/I18nProvider";
import { HtmlLang } from "@/components/HtmlLang";
import { getRequestLanguage, getUser } from "@/lib/context";
import { i18nProps } from "@/lib/i18n/server";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (await getUser()) redirect("/dashboard");
  const lang = await getRequestLanguage();
  const { next, error } = await searchParams;
  return (
    <I18nProvider {...i18nProps({ language: lang })}>
      <HtmlLang lang={lang} />
      <AuthForm mode="signup" next={next} linkError={error === "link"} />
    </I18nProvider>
  );
}
