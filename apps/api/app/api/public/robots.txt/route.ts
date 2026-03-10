import { getSeoSettings } from "@/src/services/seo/seoSettingsService";

export const dynamic = "force-dynamic";

const DEFAULT_ROBOTS = `User-agent: *
Allow: /

Sitemap: https://8fold.app/sitemap.xml`;

export async function GET() {
  const settings = await getSeoSettings();

  const body = settings?.robotsTxt?.trim()
    ? settings.robotsTxt
    : DEFAULT_ROBOTS;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
