import { getSeoSettings } from "@/src/services/seo/seoSettingsService";

export const dynamic = "force-dynamic";

/**
 * Serves the IndexNow key verification file.
 * Search engines request /{key}.txt at the domain root to verify ownership.
 * The web app's next.config.ts rewrites /{key}.txt → this endpoint.
 *
 * The key is read server-side from seo_settings — never exposed in client bundles.
 */
export async function GET() {
  const settings = await getSeoSettings();

  if (!settings?.indexNowKey) {
    return new Response("IndexNow key not configured", { status: 404 });
  }

  return new Response(settings.indexNowKey, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
