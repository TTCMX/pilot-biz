import { notFound } from "next/navigation";
import { getPublicBusiness } from "@/lib/booking/public";
import { I18nProvider } from "@/components/I18nProvider";
import { HtmlLang } from "@/components/HtmlLang";
import { i18nProps } from "@/lib/i18n/server";

export default async function PublicLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getPublicBusiness(slug);
  if (!business) notFound();
  return (
    <I18nProvider {...i18nProps(business)}>
      <HtmlLang lang={business.language} />
      <div className="min-h-dvh bg-white sm:bg-stone-100">
        <div className="mx-auto max-w-lg sm:py-8">{children}</div>
      </div>
    </I18nProvider>
  );
}
