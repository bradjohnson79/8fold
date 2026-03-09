import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["pg", "nodemailer"],
  webpack: (config) => {
    // Force nodemailer (and all its Node.js sub-packages) to be treated as
    // runtime externals rather than bundled. This prevents webpack from trying
    // to resolve Node built-ins like 'crypto' that nodemailer uses internally.
    const prev = config.externals ?? [];
    config.externals = [
      ...(Array.isArray(prev) ? prev : [prev]),
      ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
        if (request && /^nodemailer/.test(request)) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ];
    return config;
  },
};

export default nextConfig;

