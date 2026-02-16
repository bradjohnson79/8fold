import { bus } from "@/server/bus/bus";
import { apiFetch } from "@/server/api/apiClient";

type RecentJobsPayload = { limit?: number | string | null };
type JobsByLocationPayload = {
  country?: "US" | "CA" | string | null;
  regionCode?: string | null;
  city?: string | null;
  limit?: number | string | null;
};
type CitiesWithJobsPayload = { country?: "US" | "CA" | string | null; regionCode?: string | null };

function unwrapOkData(json: any): any {
  if (json && typeof json === "object" && "data" in json) return (json as any).data;
  return json;
}

async function fetchJson(path: string): Promise<any> {
  const resp = await apiFetch({ path, method: "GET" });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = typeof json?.error === "string" ? json.error : `Upstream error (${resp.status})`;
    throw Object.assign(new Error(msg), { status: resp.status });
  }
  return unwrapOkData(json);
}

export function registerPublicDiscoveryHandlers() {
  const KEY = "__ROME_PUBLIC_DISCOVERY_HANDLERS__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;

  bus.register("public.jobs.recent", async ({ payload }: { payload: RecentJobsPayload }) => {
    const qs = new URLSearchParams();
    if (payload?.limit != null) qs.set("limit", String(payload.limit));
    const data = await fetchJson(`/api/public/jobs/recent${qs.toString() ? `?${qs.toString()}` : ""}`);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return { ok: true, jobs };
  });

  bus.register("public.jobs.byLocation", async ({ payload }: { payload: JobsByLocationPayload }) => {
    const qs = new URLSearchParams();
    if (payload?.country) qs.set("country", String(payload.country));
    if (payload?.regionCode) qs.set("regionCode", String(payload.regionCode));
    if (payload?.city) qs.set("city", String(payload.city));
    if (payload?.limit != null) qs.set("limit", String(payload.limit));
    const data = await fetchJson(`/api/public/jobs/by-location?${qs.toString()}`);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return { ok: true, jobs };
  });

  bus.register("public.locations.regionsWithJobs", async () => {
    // apps/api returns an array already.
    return await fetchJson("/api/public/locations/regions-with-jobs");
  });

  bus.register("public.locations.citiesWithJobs", async ({ payload }: { payload: CitiesWithJobsPayload }) => {
    const qs = new URLSearchParams();
    if (payload?.country) qs.set("country", String(payload.country));
    if (payload?.regionCode) qs.set("regionCode", String(payload.regionCode));
    const out = payload?.country && payload?.regionCode
      ? await fetchJson(`/api/public/locations/cities-with-jobs?${qs.toString()}`)
      : [];
    return out;
  });
}

registerPublicDiscoveryHandlers();

