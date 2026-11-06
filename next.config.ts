import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    // Keep visited pages in the client router cache so moving back and forth
    // between workspace pages is instant instead of re-rendering on the server.
    // Server actions that call revalidatePath still clear this cache.
    staleTimes: { dynamic: 30, static: 180 }
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
