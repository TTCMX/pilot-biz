import type { NextConfig } from "next";

const OWNER_SECTIONS = "dashboard|calendar|customers|services|staff|waitlist|settings|lookbook|onboarding|login|signup|forgot-password|reset-password";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // CSV imports and logo uploads
    // Reuse a screen visited in the last 30 s when navigating back to it. Any
    // server action that changes data (revalidatePath) clears this cache.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      // The owner app can't be framed (clickjacking). Public booking pages stay
      // embeddable so a studio can show them on its own website.
      { source: `/:section(${OWNER_SECTIONS})/:path*`, headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
