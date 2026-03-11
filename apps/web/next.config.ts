import type { NextConfig } from 'next'

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").trim() || "https://api.8fold.app";

const nextConfig: NextConfig = {
  transpilePackages: ['@8fold/shared'],
  async rewrites() {
    return [
      // Proxy sitemap index — Google submits this URL to Search Console.
      {
        source: '/sitemap.xml',
        destination: `${API_URL}/api/public/sitemap.xml`,
      },
      // Proxy all child sitemaps referenced inside the sitemap index.
      // The index uses canonical URLs like https://8fold.app/api/public/sitemap-jobs.xml
      // so requests to /api/public/* must be forwarded to the API host.
      // Next.js checks filesystem routes first; since web has no /api/public/ handlers,
      // this wildcard is safe and will never shadow real web routes.
      {
        source: '/api/public/:path*',
        destination: `${API_URL}/api/public/:path*`,
      },
      {
        source: '/robots.txt',
        destination: `${API_URL}/api/public/robots.txt`,
      },
      // IndexNow key verification: search engines request /{key}.txt at the domain root.
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
