import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@8fold/shared'],
  images: {
    // No localhost allowlist in repo; local dev should serve images from real hosts or use unoptimized images.
    remotePatterns: [
      { protocol: "https", hostname: "8fold.app" },
      { protocol: "https", hostname: "api.8fold.app" },
      { protocol: "https", hostname: "admin.8fold.app" },
      { protocol: "https", hostname: "**.vercel.app" },
    ],
  },
}

export default nextConfig