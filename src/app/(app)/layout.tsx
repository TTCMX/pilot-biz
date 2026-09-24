import { requireBusiness } from "@/lib/context";
import { I18nProvider } from "@/components/I18nProvider";
import { HtmlLang } from "@/components/HtmlLang";
import { AppNav } from "@/components/AppNav";
import { i18nProps } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { business } = await requireBusiness();
  return (
    <I18nProvider {...i18nProps(business)}>
      <HtmlLang lang={business.language} />
      <div className="min-h-dvh md:flex">
        <AppNav businessName={business.name} slug={business.slug} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-2 sm:px-6 md:pb-10 md:pl-2 md:pr-8 md:pt-6">{children}</main>
      </div>
    </I18nProvider>
  );
}
