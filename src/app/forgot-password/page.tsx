import { ForgotPasswordForm } from "@/components/PasswordForms";
import { I18nProvider } from "@/components/I18nProvider";
import { HtmlLang } from "@/components/HtmlLang";
import { getRequestLanguage } from "@/lib/context";
import { i18nProps } from "@/lib/i18n/server";

export default async function ForgotPasswordPage() {
  const lang = await getRequestLanguage();
  return (
    <I18nProvider {...i18nProps({ language: lang })}>
      <HtmlLang lang={lang} />
      <ForgotPasswordForm />
    </I18nProvider>
  );
}
