/**
 * Phase 13: Auth + session + role-gated load simulation.
 *
 * Simulates:
 * - N concurrent logins (request + verify)
 * - N concurrent /api/me calls
 * - N concurrent role-gated calls
 *
 * Uses apps/api directly for session minting (gets sessionToken from JSON),
 * then uses that token as:
 * - Authorization: Bearer <token> (apps/api)
 * - Cookie: sid=<token> (apps/web proxy routes)
 *
 * Run (example):
 *   API_ORIGIN=http://localhost:3003 WEB_ORIGIN=http://localhost:3006 pnpm -C apps/api exec tsx scripts/load-sim-auth.ts
 */
type Json = any;

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim().replace(/\/+$/, "");
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function nowMs() {
  return Date.now();
}

async function readTextSafe(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

async function httpJson(opts: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; durationMs: number; json: Json | null; text: string }> {
  const start = nowMs();
  const resp = await fetch(opts.url, {
    method: opts.method,
    headers: {
      ...(opts.headers ?? {}),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const text = await readTextSafe(resp);
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: resp.status, durationMs: nowMs() - start, json, text };
}

function summarize(label: string, rows: Array<{ status: number; durationMs: number }>) {
  const total = rows.length;
  const ok = rows.filter((r) => r.status >= 200 && r.status < 300).length;
  const byStatus = new Map<number, number>();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const durs = rows.map((r) => r.durationMs).sort((a, b) => a - b);
  const p = (pct: number) => durs.length ? durs[Math.min(durs.length - 1, Math.floor((pct / 100) * durs.length))] : 0;
  console.log(JSON.stringify({
    event: "load.summary",
    label,
    total,
    ok,
    byStatus: Object.fromEntries([...byStatus.entries()].sort((a, b) => a[0] - b[0])),
    p50Ms: p(50),
    p95Ms: p(95),
    p99Ms: p(99),
  }));
}

async function runPool<T>(opts: { concurrency: number; items: T[]; fn: (item: T, idx: number) => Promise<void> }) {
  const { concurrency, items, fn } = opts;
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
}

type LoginResult = { email: string; role: "router" | "job-poster"; sessionToken: string; expiresAt: string };

async function main() {
  const API_ORIGIN = mustEnv("API_ORIGIN");
  const WEB_ORIGIN = mustEnv("WEB_ORIGIN");

  const N = Number(process.env.LOAD_N ?? "100");
  const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? String(N));

  const ts = Date.now();
  const emails = Array.from({ length: N }, (_, i) => `load+${ts}+${i}@example.com`);

  const loginResults: LoginResult[] = [];
  const loginSamples: Array<{ status: number; durationMs: number }> = [];

  console.log(JSON.stringify({ event: "load.start", N, CONCURRENCY, API_ORIGIN, WEB_ORIGIN }));

  // 1) N concurrent logins (request + verify)
  await runPool({
    concurrency: CONCURRENCY,
    items: emails,
    fn: async (email) => {
      const req = await httpJson({ url: `${API_ORIGIN}/api/auth/request`, method: "POST", body: { email } });
      if (req.status !== 200 || !req.json) {
        loginSamples.push({ status: req.status, durationMs: req.durationMs });
        return;
      }
      const debugCode = String(req.json.debugCode ?? "");
      if (!debugCode) {
        loginSamples.push({ status: 500, durationMs: req.durationMs });
        return;
      }

      const role: "router" | "job-poster" = "job-poster";
      const verify = await httpJson({
        url: `${API_ORIGIN}/api/auth/verify`,
        method: "POST",
        body: { token: debugCode, role },
      });
      loginSamples.push({ status: verify.status, durationMs: req.durationMs + verify.durationMs });
      if (verify.status !== 200 || !verify.json || !verify.json.sessionToken) return;
      loginResults.push({
        email,
        role,
        sessionToken: String(verify.json.sessionToken),
        expiresAt: String(verify.json.expiresAt ?? ""),
      });
    },
  });
  summarize("login.request+verify", loginSamples);
  console.log(JSON.stringify({ event: "load.login_done", minted: loginResults.length, failed: N - loginResults.length }));

  if (!loginResults.length) {
    console.log(JSON.stringify({ event: "load.abort", reason: "no_sessions_minted" }));
    return;
  }

  // 2) N concurrent /api/me calls (apps/api)
  const meSamples: Array<{ status: number; durationMs: number }> = [];
  await runPool({
    concurrency: CONCURRENCY,
    items: loginResults.slice(0, N),
    fn: async (lr) => {
      const r = await httpJson({
        url: `${API_ORIGIN}/api/me`,
        method: "GET",
        headers: { authorization: `Bearer ${lr.sessionToken}` },
      });
      meSamples.push({ status: r.status, durationMs: r.durationMs });
    },
  });
  summarize("api.me", meSamples);

  // 3) N concurrent role-gated requests (apps/web proxy to apps/api)
  // Use a single session to simulate dashboard burst (more realistic).
  const primary = loginResults[0]!;
  // Complete job poster onboarding for primary session (best-effort).
  await httpJson({
    url: `${API_ORIGIN}/api/web/job-poster-tos`,
    method: "POST",
    headers: { authorization: `Bearer ${primary.sessionToken}` },
    body: { accepted: true, version: "1.0" },
  }).catch(() => null);
  await httpJson({
    url: `${API_ORIGIN}/api/web/job-poster/profile`,
    method: "POST",
    headers: { authorization: `Bearer ${primary.sessionToken}` },
    body: {
      name: "Load Test",
      email: primary.email,
      phone: "5555555555",
      address: "123 Main St",
      city: "Vancouver",
      stateProvince: "BC",
      country: "CA",
    },
  }).catch(() => null);

  const gatedSamples: Array<{ status: number; durationMs: number }> = [];
  const gatedItems = Array.from({ length: N }, (_, i) => i);
  await runPool({
    concurrency: CONCURRENCY,
    items: gatedItems,
    fn: async () => {
      const start = nowMs();
      const r = await fetch(`${WEB_ORIGIN}/api/app/job-poster/jobs`, {
        method: "GET",
        headers: { cookie: `sid=${encodeURIComponent(primary.sessionToken)}` },
        cache: "no-store",
      });
      await readTextSafe(r); // consume
      gatedSamples.push({ status: r.status, durationMs: nowMs() - start });
    },
  });
  summarize("web.job_poster.jobs", gatedSamples);

  console.log(JSON.stringify({ event: "load.done" }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};

