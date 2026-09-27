import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // CSV imports and logo uploads
    // Reuse a screen visited in the last 30 s when navigating back to it. Any
    // server action that changes data (revalidatePath) clears this cache.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
