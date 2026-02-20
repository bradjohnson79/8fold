import { bus } from "@/server/bus/bus";
import { apiFetch } from "@/server/api/apiClient";

type RecentJobsPayload = { limit?: number | string | null };
type JobsByLocationPayload = {
  country?: "US" | "CA" | string | null;
  regionCode?: string | null;
  city?: string | null;
  limit?: number | string | null;
};
type CitiesWithJobsPayload = {
  country?: "US" | "CA" | string | null;
  regionCode?: string | null;
  state?: string | null;
};
type FlagJobPayload = { jobId?: string | null; reason?: string | null };

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

async function postJson(path: string, body: unknown): Promise<any> {
  const resp = await apiFetch({
    path,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = typeof json?.error === "string" ? json.error : `Upstream error (${resp.status})`;
    throw Object.assign(new Error(msg), { status: resp.status });
  }
  return unwrapOkData(json);
}

export function registerPublicDiscoveryHandlers() {
  function normalizeCountry(input: string | null | undefined): "US" | "CA" | null {
    const v = String(input ?? "").trim().toUpperCase();
    if (v === "US" || v === "CA") return v;
    return null;
  }

  function normalizeRegionCode(input: string | null | undefined): string {
    return String(input ?? "").trim().toUpperCase();
  }

  function inferCountryFromRegionCode(regionCode: string): "US" | "CA" {
    // Canonical CA provinces in this repo (no territories).
    const ca = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"]);
    return ca.has(regionCode) ? "CA" : "US";
  }

  // In dev, module hot-reload keeps `globalThis` but reloads modules.
  // If we guard registration with a single boolean, newly-added handlers won't
  // be registered until a full server restart. Instead, attempt to register and
  // ignore duplicate-registration errors.
  function safeRegister<TPayload, TResult>(
    type: string,
    handler: (args: { payload: TPayload }) => Promise<TResult>,
  ) {
    try {
      bus.register(type as any, handler as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Handler already registered for:")) return;
      throw e;
    }
  }

  safeRegister("public.jobs.recent", async ({ payload }: { payload: RecentJobsPayload }) => {
    const qs = new URLSearchParams();
    if (payload?.limit != null) qs.set("limit", String(payload.limit));
    const data = await fetchJson(`/api/public/jobs/recent${qs.toString() ? `?${qs.toString()}` : ""}`);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return { ok: true, jobs };
  });

  safeRegister("public.jobs.byLocation", async ({ payload }: { payload: JobsByLocationPayload }) => {
    const qs = new URLSearchParams();
    if (payload?.country) qs.set("country", String(payload.country));
    if (payload?.regionCode) qs.set("regionCode", String(payload.regionCode));
    if (payload?.city) qs.set("city", String(payload.city));
    if (payload?.limit != null) qs.set("limit", String(payload.limit));
    const data = await fetchJson(`/api/public/jobs/by-location?${qs.toString()}`);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return { ok: true, jobs };
  });

  safeRegister("public.locations.regionsWithJobs", async () => {
    // apps/api returns an array already.
    return await fetchJson("/api/public/locations/regions-with-jobs");
  });

  safeRegister("public.locations.citiesWithJobs", async ({ payload }: { payload: CitiesWithJobsPayload }) => {
    const regionCode = normalizeRegionCode(payload?.regionCode ?? payload?.state);
    const country = normalizeCountry(payload?.country) ?? (regionCode ? inferCountryFromRegionCode(regionCode) : null);
    const qs = new URLSearchParams();
    if (country) qs.set("country", country);
    if (regionCode) qs.set("regionCode", regionCode);
    const out = country && regionCode
      ? await fetchJson(`/api/public/locations/cities-with-jobs?${qs.toString()}`)
      : [];
    return out;
  });

  safeRegister("public.jobs.flag", async ({ payload }: { payload: FlagJobPayload }) => {
    const jobId = String(payload?.jobId ?? "").trim();
    const reason = String(payload?.reason ?? "").trim();
    if (!jobId || !reason) return { ok: false, error: "Missing jobId or reason" };
    await postJson("/api/public/jobs/flag", { jobId, reason });
    return { ok: true };
  });
}

registerPublicDiscoveryHandlers();

