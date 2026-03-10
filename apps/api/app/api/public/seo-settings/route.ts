import { getSeoSettings } from "@/src/services/seo/seoSettingsService";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSeoSettings();

  const data = {
    metaPixelId: settings?.metaPixelId ?? null,
    ga4MeasurementId: settings?.ga4MeasurementId ?? null,
    canonicalDomain: settings?.canonicalDomain ?? null,
    facebookUrl: settings?.facebookUrl ?? null,
    twitterUrl: settings?.twitterUrl ?? null,
    linkedinUrl: settings?.linkedinUrl ?? null,
  };

  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
    },
  });
}
