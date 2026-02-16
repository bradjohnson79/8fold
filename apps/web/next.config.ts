import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@8fold/shared'],
  images: {
    domains: ['localhost'],
  },
}

export default nextConfig