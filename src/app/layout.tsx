import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-dm-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  applicationName: APP_NAME,
  description: "Appointments, booking and customers for service businesses.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#eceee4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
