import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["pg"],
};

export default nextConfig;

