/**
 * GA4 Analytics Data API integration.
 * Fetches traffic, acquisition, and conversion metrics using the same
 * Google service account as the Indexing API.
 */
import { getGoogleAccessToken, getGoogleServiceAccount } from "./googleAuthService";

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export type Ga4AnalyticsResult = {
  visitorsToday: number;
  visitors7d: number;
  visitors30d: number;
  topPages: Array<{ path: string; views: number }>;
  countries: Array<{ country: string; users: number }>;
  devices: Array<{ type: string; users: number }>;
  trafficSources: Array<{ source: string; sessions: number }>;
};

type RunReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function runReport(
  propertyId: string,
  accessToken: string,
  request: {
    dimensions?: Array<{ name: string }>;
    metrics: Array<{ name: string }>;
    dateRanges: Array<{ startDate: string; endDate: string }>;
    limit?: number;
    orderBys?: Array<{ metric?: { metricName: string }; desc: boolean }>;
  },
): Promise<RunReportResponse> {
  const prop = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
  const url = `https://analyticsdata.googleapis.com/v1beta/${prop}:runReport`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(request),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GA4 API error ${resp.status}: ${body.slice(0, 300)}`);
  }

  return (await resp.json()) as RunReportResponse;
}

export async function fetchGa4Analytics(): Promise<Ga4AnalyticsResult | null> {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const serviceAccount = getGoogleServiceAccount();

  if (!propertyId || !serviceAccount) {
    return null;
  }

  try {
    const accessToken = await getGoogleAccessToken(serviceAccount, GA4_SCOPE);

    const today = formatDate(new Date());
    const sevenDaysAgo = formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const [visitorsTodayRes, visitors7dRes, visitors30dRes, topPagesRes, countriesRes, devicesRes, sourcesRes] =
      await Promise.all([
        runReport(propertyId, accessToken, {
          metrics: [{ name: "activeUsers" }],
          dateRanges: [{ startDate: today, endDate: today }],
        }),
        runReport(propertyId, accessToken, {
          metrics: [{ name: "activeUsers" }],
          dateRanges: [{ startDate: sevenDaysAgo, endDate: today }],
        }),
        runReport(propertyId, accessToken, {
          metrics: [{ name: "activeUsers" }],
          dateRanges: [{ startDate: thirtyDaysAgo, endDate: today }],
        }),
        runReport(propertyId, accessToken, {
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          dateRanges: [{ startDate: sevenDaysAgo, endDate: today }],
          limit: 10,
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        }),
        runReport(propertyId, accessToken, {
          dimensions: [{ name: "country" }],
          metrics: [{ name: "activeUsers" }],
          dateRanges: [{ startDate: sevenDaysAgo, endDate: today }],
          limit: 10,
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        }),
        runReport(propertyId, accessToken, {
          dimensions: [{ name: "deviceCategory" }],
          metrics: [{ name: "activeUsers" }],
          dateRanges: [{ startDate: sevenDaysAgo, endDate: today }],
        }),
        runReport(propertyId, accessToken, {
          dimensions: [{ name: "sessionSource" }],
          metrics: [{ name: "sessions" }],
          dateRanges: [{ startDate: sevenDaysAgo, endDate: today }],
          limit: 10,
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        }),
      ]);

    const getMetric = (res: RunReportResponse, metricIndex = 0): number => {
      const val = res.rows?.[0]?.metricValues?.[metricIndex]?.value;
      return val ? parseInt(val, 10) : 0;
    };

    const topPages: Array<{ path: string; views: number }> = (topPagesRes.rows ?? []).map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? "(not set)",
      views: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
    }));

    const countries: Array<{ country: string; users: number }> = (countriesRes.rows ?? []).map((r) => ({
      country: r.dimensionValues?.[0]?.value ?? "(not set)",
      users: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
    }));

    const devices: Array<{ type: string; users: number }> = (devicesRes.rows ?? []).map((r) => ({
      type: (r.dimensionValues?.[0]?.value ?? "unknown").toLowerCase(),
      users: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
    }));

    const trafficSources: Array<{ source: string; sessions: number }> = (sourcesRes.rows ?? []).map((r) => ({
      source: (r.dimensionValues?.[0]?.value ?? "(direct)").toLowerCase(),
      sessions: parseInt(r.metricValues?.[0]?.value ?? "0", 10),
    }));

    return {
      visitorsToday: getMetric(visitorsTodayRes),
      visitors7d: getMetric(visitors7dRes),
      visitors30d: getMetric(visitors30dRes),
      topPages,
      countries,
      devices,
      trafficSources,
    };
  } catch (e) {
    console.error("[GA4 Analytics] fetch failed:", e instanceof Error ? e.message : e);
    throw e;
  }
}

export function isGa4AnalyticsConfigured(): boolean {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const serviceAccount = getGoogleServiceAccount();
  return Boolean(propertyId && serviceAccount);
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: { data: Ga4AnalyticsResult; expiresAt: number } | null = null;

export async function getGa4AnalyticsCached(): Promise<Ga4AnalyticsResult | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.data;
  }
  const data = await fetchGa4Analytics();
  if (data) {
    cache = { data, expiresAt: now + CACHE_TTL_MS };
  } else {
    cache = null;
  }
  return data;
}
