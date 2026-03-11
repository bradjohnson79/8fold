import type { NextConfig } from 'next'

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").trim() || "https://api.8fold.app";

const nextConfig: NextConfig = {
  transpilePackages: ['@8fold/shared'],
  async rewrites() {
    return [
      // Proxy sitemap and robots from the API (admin-controlled content)
      {
        source: '/sitemap.xml',
        destination: `${API_URL}/api/public/sitemap.xml`,
      },
      {
        source: '/robots.txt',
        destination: `${API_URL}/api/public/robots.txt`,
      },
      // IndexNow key verification: search engines request /{key}.txt at the domain root.
      // The regex matches 32–128 hex/alphanumeric character filenames ending in .txt.
      // This is safe — specific page routes (/jobs, etc.) take priority in Next.js routing.
      {
        source: '/:key([a-f0-9A-F]{32,128}).txt',
        destination: `${API_URL}/api/public/indexnow-key`,
      },
    ];
  },
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
