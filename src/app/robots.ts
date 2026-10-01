import type { MetadataRoute } from "next";

// Booking pages are public and indexable; the owner app, private booking links and APIs are not.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/*/a/", "/dashboard", "/calendar", "/customers", "/services", "/staff", "/waitlist", "/settings", "/lookbook", "/onboarding", "/reset-password"],
    },
    host: base,
  };
}
