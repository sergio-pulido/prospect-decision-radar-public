import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Profiles and fixtures are read from disk at request time.
  outputFileTracingIncludes: {
    "/api/**": ["./profiles/**", "./fixtures/**"],
  },
};

export default nextConfig;
