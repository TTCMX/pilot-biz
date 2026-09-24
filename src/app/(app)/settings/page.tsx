import { requireBusiness } from "@/lib/context";
import { env } from "@/lib/env";
import { SettingsView } from "./SettingsView";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { business } = await requireBusiness();
  return <SettingsView business={business} bookingUrl={`${env.appUrl()}/${business.slug}`} appUrl={env.appUrl()} />;
}
