/**
 * DEV-ONLY health check for public API endpoints.
 * Do NOT run on page load in production.
 * Only run when ?debug=1 is present and NODE_ENV !== "production".
 */

export type EndpointResult = {
  name: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

export type HealthCheckResult = {
  ok: boolean;
  results: EndpointResult[];
};

export async function checkPublicEndpoints(): Promise<HealthCheckResult> {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const results: EndpointResult[] = [];

  const endpoints: Array<{ name: string; url: string }> = [
    { name: "recent", url: `${base}/api/public/jobs/recent` },
    { name: "cities", url: `${base}/api/public/jobs/cities?region=AL` },
    { name: "by-location", url: `${base}/api/public/jobs/by-location?country=US&regionCode=AL&city=Birmingham` },
  ];

  for (const { name, url } of endpoints) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      results.push({
        name,
        url,
        ok: resp.ok,
        status: resp.status,
        error: resp.ok ? undefined : `HTTP ${resp.status}`,
      });
    } catch (e) {
      results.push({
        name,
        url,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const ok = results.every((r) => r.ok);
  return { ok, results };
}

/**
 * Run health check only when debug=1 is in URL and not in production.
 * Logs results to console. Does not block rendering.
 */
export function runHealthCheckIfDebug(): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "1") return;

  void checkPublicEndpoints().then((result) => {
    if (result.ok) {
      // eslint-disable-next-line no-console
      console.info("[publicEndpointHealth] All endpoints OK", result.results);
    } else {
      // eslint-disable-next-line no-console
      console.warn("[publicEndpointHealth] Some endpoints failed", result.results);
    }
  });
}
