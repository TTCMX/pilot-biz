import { redirect } from "next/navigation";
import { getBusiness, getProfile, getRequestLanguage, getUser } from "@/lib/context";
import { I18nProvider } from "@/components/I18nProvider";
import { HtmlLang } from "@/components/HtmlLang";
import { i18nProps } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/onboarding");
  const [business, profile, lang] = await Promise.all([getBusiness(), getProfile(), getRequestLanguage()]);
  if (business?.onboarding_completed) redirect("/dashboard");

  const props = business ? i18nProps(business) : i18nProps({ language: lang });
  return (
    <I18nProvider {...props}>
      <HtmlLang lang={business?.language ?? lang} />
      <OnboardingWizard
        business={business ? { id: business.id, slug: business.slug, business_type: business.business_type, currency: business.currency, week_start: business.week_start } : null}
        ownerName={profile?.name ?? ""}
        appUrl={env.appUrl()}
        language={lang}
      />
    </I18nProvider>
  );
}
