import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "Pilot", template: "%s · Pilot" },
  description: "Appointments, booking and customers for service businesses.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#db2777" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
