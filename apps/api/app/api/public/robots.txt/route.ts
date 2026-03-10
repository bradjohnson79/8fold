import { NextResponse } from "next/server";
import { getSeoSettings } from "@/src/services/v4/seo/seoSettingsService";
import { getCanonicalBase } from "@/src/services/v4/seo/canonicalUrlService";

export const dynamic = "force-dynamic";

const DEFAULT_ROBOTS = (sitemapBase: string) => `User-agent: *
Allow: /

Sitemap: ${sitemapBase}/api/public/sitemap.xml
Sitemap: ${sitemapBase}/api/public/sitemap-jobs.xml
Sitemap: ${sitemapBase}/api/public/sitemap-services.xml
Sitemap: ${sitemapBase}/api/public/sitemap-contractors.xml
Sitemap: ${sitemapBase}/api/public/sitemap-cities.xml
`;

export async function GET() {
  try {
    const [settings, base] = await Promise.all([getSeoSettings(), getCanonicalBase()]);
    const content = settings?.robotsTxt?.trim() || DEFAULT_ROBOTS(base);

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (e) {
    console.error("[public/robots.txt]", e);
    return new NextResponse(
      "User-agent: *\nAllow: /\n",
      { status: 200, headers: { "Content-Type": "text/plain" } },
    );
  }
}
