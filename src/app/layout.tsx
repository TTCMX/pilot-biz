import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
