#!/usr/bin/env tsx
/**
 * Runtime smoke test — Tier 1 endpoints must not return 500.
 *
 * - GET /api/public/jobs/recent?limit=1 → 200
 * - GET /api/web/router/routable-jobs → 401 (auth) or 200, NOT 500
 *
 * Usage: API_ORIGIN=http://localhost:3003 pnpm -C apps/api smoke:test
 * Default API_ORIGIN: http://localhost:3003
 */
const API_ORIGIN = String(process.env.API_ORIGIN ?? "http://localhost:3003").replace(/\/+$/, "");

async function fetchStatus(url: string): Promise<number> {
  const resp = await fetch(url, { cache: "no-store" });
  return resp.status;
}

async function main(): Promise<void> {
  console.log(`Smoke test: ${API_ORIGIN}`);

  const recentStatus = await fetchStatus(`${API_ORIGIN}/api/public/jobs/recent?limit=1`);
  if (recentStatus !== 200) {
    console.error(`[FAIL] /api/public/jobs/recent: expected 200, got ${recentStatus}`);
    process.exit(1);
  }
  console.log("[PASS] /api/public/jobs/recent → 200");

  const routerStatus = await fetchStatus(`${API_ORIGIN}/api/web/router/routable-jobs`);
  if (routerStatus === 500) {
    console.error(`[FAIL] /api/web/router/routable-jobs: got 500 (schema/runtime error)`);
    process.exit(1);
  }
  if (routerStatus !== 401 && routerStatus !== 200) {
    console.error(`[FAIL] /api/web/router/routable-jobs: expected 401 or 200, got ${routerStatus}`);
    process.exit(1);
  }
  console.log(`[PASS] /api/web/router/routable-jobs → ${routerStatus}`);

  console.log("Runtime smoke test passed.");
}

main().catch((err) => {
  console.error(String((err as any)?.message ?? err));
  process.exit(1);
});

export {};
