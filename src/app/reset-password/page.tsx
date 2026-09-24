import { ResetPasswordForm } from "@/components/PasswordForms";
import { I18nProvider } from "@/components/I18nProvider";
import { HtmlLang } from "@/components/HtmlLang";
import { getBusiness, getRequestLanguage, getUser } from "@/lib/context";
import { i18nProps } from "@/lib/i18n/server";

// Reached from the reset email via /auth/callback, which signs the user in.
export default async function ResetPasswordPage() {
  const [user, business, lang] = await Promise.all([getUser(), getBusiness(), getRequestLanguage()]);
  const language = business?.language ?? lang;
  return (
    <I18nProvider {...i18nProps({ language })}>
      <HtmlLang lang={language} />
      <ResetPasswordForm hasSession={!!user} />
    </I18nProvider>
  );
}
