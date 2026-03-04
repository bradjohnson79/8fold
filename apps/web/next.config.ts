import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@8fold/shared'],
  images: {
    domains: [
      'localhost',
      // Common image hosting services
      's3.amazonaws.com',
      '*.s3.amazonaws.com',
      's3.us-west-2.amazonaws.com',
      's3.us-east-1.amazonaws.com',
      'cloudfront.net',
      '*.cloudfront.net',
      // Image optimization/CDN services
      'images.unsplash.com',
      'imgur.com',
      'i.imgur.com',
      'placehold.co',
      // Add your production image domain here
      // 'your-cdn.com',
    ],
    // Allow unoptimized images for external URLs that fail optimization
    unoptimized: process.env.NODE_ENV === 'development',
  },
}

export default nextConfig