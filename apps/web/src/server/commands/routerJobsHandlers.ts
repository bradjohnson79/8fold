import { bus } from "@/server/bus/bus";
import { apiFetch } from "@/server/api/apiClient";

export function registerRouterJobsHandlers() {
  const KEY = "__ROME_ROUTER_JOBS_HANDLERS__";
  if ((globalThis as any)[KEY]) return;
  (globalThis as any)[KEY] = true;

  bus.register("router.jobs.routable", async ({ context }) => {
    const token = String(context.sessionToken ?? "").trim();
    if (!token) return { ok: true, jobs: [] };

    const resp = await apiFetch({ path: "/api/web/router/routable-jobs", method: "GET", sessionToken: token });
    const json = (await resp.json().catch(() => null)) as any;
    if (!resp.ok) {
      const msg = typeof json?.error === "string" ? json.error : `Upstream error (${resp.status})`;
      throw Object.assign(new Error(msg), { status: resp.status });
    }

    // apps/api uses respond.ok() => { ok: true, data: { jobs } }
    const jobs = Array.isArray(json?.jobs) ? json.jobs : Array.isArray(json?.data?.jobs) ? json.data.jobs : [];
    return { ok: true, jobs };
  });
}

registerRouterJobsHandlers();

