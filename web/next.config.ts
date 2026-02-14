import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "photo-gallery-app-20251204.firebasestorage.app",
      },
    ],
  },
};

export default nextConfig;
