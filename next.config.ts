import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // CSV imports and logo uploads
  },
};

export default nextConfig;
