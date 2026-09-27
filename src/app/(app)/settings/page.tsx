import { requireBusiness } from "@/lib/context";
import { env } from "@/lib/env";
import { emailSender, isEmailEnabled } from "@/lib/email/send";
import { SettingsView } from "./SettingsView";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { business } = await requireBusiness();
  return <SettingsView business={business} bookingUrl={`${env.appUrl()}/${business.slug}`} appUrl={env.appUrl()} email={{ enabled: isEmailEnabled(), ...emailSender() }} />;
}
