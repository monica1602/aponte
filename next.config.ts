import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/certificados/**": ["src/fonts/**/*"],
  },
};

export default nextConfig;
