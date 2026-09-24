import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/brand";

const googleSans = Google_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-google-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  applicationName: APP_NAME,
  description: "Appointments, booking and customers for service businesses.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8fafd" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={googleSans.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
