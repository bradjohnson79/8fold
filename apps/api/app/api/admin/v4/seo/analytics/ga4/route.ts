/**
 * GA4 Analytics Data API — returns traffic, top pages, sources, devices, countries.
 * Cached for 5 minutes. Requires GA4_PROPERTY_ID + Google service account credentials.
 */
import { NextResponse } from "next/server";
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
      console.warn("[seo/analytics/ga4 GET] GA4 returned no data — likely an API auth or property access issue");
      return NextResponse.json({ ok: false, error: "GA4_FETCH_FAILED" }, { status: 200 });
    }
    return ok(data);
  } catch (e) {
    console.error("[seo/analytics/ga4 GET]", e);
    return NextResponse.json({ ok: false, error: "GA4_FETCH_FAILED" }, { status: 200 });
  }
}
