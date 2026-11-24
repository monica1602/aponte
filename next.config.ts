import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  outputFileTracingIncludes: {
    "/certificados/**": ["src/fonts/**/*"],
  },
};

export default nextConfig;
