import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@8fold/shared'],
  images: {
    domains: ['localhost'],
    remotePatterns: [
      { protocol: 'https', hostname: '**', pathname: '/**' },
      { protocol: 'http', hostname: '**', pathname: '/**' },
    ],
  },
}

export default nextConfig