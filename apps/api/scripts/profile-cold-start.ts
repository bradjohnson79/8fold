/**
 * Phase 13: Cold start profiling helper.
 *
 * Measure first-hit vs warm latencies for:
 * - apps/api: /api/system/health
 * - apps/web: /api/app/system/health
 * - apps/web: /api/app/me (requires session)
 * - apps/web: /app/job-poster (HTML)
 *
 * Run right after restarting servers for “cold”:
 *   API_ORIGIN=http://localhost:3003 WEB_ORIGIN=http://localhost:3006 pnpm -C apps/api exec tsx scripts/profile-cold-start.ts
 */
type Sample = { label: string; status: number; ms: number };

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim().replace(/\/+$/, "");
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function nowMs() {
  return Date.now();
}

async function timeFetch(label: string, url: string, init?: RequestInit): Promise<Sample> {
  const start = nowMs();
  const resp = await fetch(url, { cache: "no-store", ...(init ?? {}) });
  try {
    await resp.text();
  } catch {}
  return { label, status: resp.status, ms: nowMs() - start };
}

async function main() {
  const API_ORIGIN = mustEnv("API_ORIGIN");
  const WEB_ORIGIN = mustEnv("WEB_ORIGIN");

  const email = `cold+${Date.now()}@example.com`;

  // login (api) to get a session token
  const reqStart = nowMs();
  const reqResp = await fetch(`${API_ORIGIN}/api/auth/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  const reqJson = await reqResp.json().catch(() => null as any);
  const debugCode = String(reqJson?.debugCode ?? "");
  const verifyResp = await fetch(`${API_ORIGIN}/api/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: debugCode, role: "job-poster" }),
    cache: "no-store",
  });
  const verifyJson = await verifyResp.json().catch(() => null as any);
  const token = String(verifyJson?.sessionToken ?? "");
  const loginMs = nowMs() - reqStart;

  const samples: Sample[] = [];
  samples.push({ label: "api.auth.login", status: verifyResp.status, ms: loginMs });

  // cold-ish measurements (first hit)
  samples.push(await timeFetch("api.system.health", `${API_ORIGIN}/api/system/health`));
  samples.push(await timeFetch("web.app.system.health", `${WEB_ORIGIN}/api/app/system/health`));
  samples.push(await timeFetch("web.api.app.me", `${WEB_ORIGIN}/api/app/me`, { headers: { cookie: `sid=${encodeURIComponent(token)}` } }));
  samples.push(await timeFetch("web.page.job_poster", `${WEB_ORIGIN}/app/job-poster`, { headers: { cookie: `sid=${encodeURIComponent(token)}` } }));

  // warm measurements
  for (let i = 0; i < 3; i++) {
    samples.push(await timeFetch("warm.api.system.health", `${API_ORIGIN}/api/system/health`));
    samples.push(await timeFetch("warm.web.api.app.me", `${WEB_ORIGIN}/api/app/me`, { headers: { cookie: `sid=${encodeURIComponent(token)}` } }));
  }

  // print
  for (const s of samples) {
    console.log(JSON.stringify({ event: "profile.sample", ...s }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

