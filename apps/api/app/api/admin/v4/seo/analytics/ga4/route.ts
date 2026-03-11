/**
 * GA4 Analytics Data API — returns traffic, top pages, sources, devices, countries.
 * Cached for 5 minutes. Requires GA4_PROPERTY_ID + Google service account credentials.
 */
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getGa4AnalyticsCached, isGa4AnalyticsConfigured } from "@/src/services/v4/seo/ga4AnalyticsService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  if (!isGa4AnalyticsConfigured()) {
    return err(400, "GA4_NOT_CONFIGURED", "Google Analytics API Not Configured. Set GA4_PROPERTY_ID and Google service account credentials.");
  }

  try {
    const data = await getGa4AnalyticsCached();
    if (!data) {
      return err(500, "GA4_FETCH_FAILED", "Analytics temporarily unavailable.");
    }
    return ok(data);
  } catch (e) {
    console.error("[seo/analytics/ga4 GET]", e);
    return err(500, "GA4_ANALYTICS_ERROR", "Analytics temporarily unavailable.");
  }
}
