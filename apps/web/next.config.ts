import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@8fold/shared'],
  images: {
    domains: [
      'localhost',
      's3.amazonaws.com',
      's3.us-west-2.amazonaws.com',
      's3.us-east-1.amazonaws.com',
      'cloudfront.net',
      'images.unsplash.com',
      'imgur.com',
      'i.imgur.com',
      'placehold.co',
    ],
    remotePatterns: [
      { protocol: 'https', hostname: '**', pathname: '/**' },
      { protocol: 'http', hostname: '**', pathname: '/**' },
    ],
    unoptimized: process.env.NODE_ENV === 'development',
  },
}

export default nextConfig
