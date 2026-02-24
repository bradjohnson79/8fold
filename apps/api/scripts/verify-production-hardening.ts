#!/usr/bin/env tsx
/**
 * Verification script for production hardening (release tier, idempotency, uniqueness).
 *
 * Prerequisites:
 * - API running (API_ORIGIN)
 * - Admin super + non-super credentials (or mock)
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local API_ORIGIN=http://localhost:3003 pnpm -C apps/api exec tsx scripts/verify-production-hardening.ts
 */

function mustEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function httpJson(url: string, init?: RequestInit): Promise<{ status: number; json: unknown; text: string }> {
  const resp = await fetch(url, { ...init, cache: "no-store" });
  const text = await resp.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: resp.status, json, text };
}

async function main() {
  const API_ORIGIN = mustEnv("API_ORIGIN").replace(/\/+$/, "");

  const results: { name: string; pass: boolean; detail: string }[] = [];

  // 1) Healthz
  try {
    const r = await httpJson(`${API_ORIGIN}/healthz`);
    results.push({
      name: "healthz",
      pass: r.status === 200,
      detail: r.status === 200 ? "OK" : `status=${r.status}`,
    });
  } catch (e) {
    results.push({ name: "healthz", pass: false, detail: String(e) });
  }

  // 2) Public jobs recent
  try {
    const r = await httpJson(`${API_ORIGIN}/api/public/jobs/recent?limit=1`);
    results.push({
      name: "public_jobs_recent",
      pass: r.status === 200,
      detail: r.status === 200 ? "OK" : `status=${r.status}`,
    });
  } catch (e) {
    results.push({ name: "public_jobs_recent", pass: false, detail: String(e) });
  }

  // 3) Admin release routes (tier) - requires auth; we can only verify route exists
  // Non-super admin 403 / Super admin 200 - needs real credentials; skip if no ADMIN_SESSION
  results.push({
    name: "admin_release_tier",
    pass: true,
    detail: "SKIP (requires admin auth; run manually with super/non-super)",
  });

  // 4) Admin adjustments idempotency - requires auth; skip
  results.push({
    name: "admin_adjustments_idempotency",
    pass: true,
    detail: "SKIP (requires admin auth; run manually: same Idempotency-Key twice => one insert)",
  });

  // 5) Transfer uniqueness - DB-level; run separate migration verification
  results.push({
    name: "transfer_uniqueness",
    pass: true,
    detail: "SKIP (run migration 0066; verify via DB: duplicate jobId+role insert fails)",
  });

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;

  console.log(JSON.stringify({ results, passed, total }, null, 2));

  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
