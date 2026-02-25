#!/usr/bin/env tsx
/**
 * Smoke test for POST /api/job/appraise-preview
 *
 * Usage: API_ORIGIN=http://localhost:3003 pnpm exec tsx scripts/testAppraisalPreview.ts
 * Default API_ORIGIN: http://localhost:3003
 */

const BODY = {
  title: "Fix leaky faucet",
  description: "Kitchen faucet drips constantly. Need repair or replacement.",
  tradeCategory: "Plumbing",
  stateProvince: "CA",
  isRegional: true,
};

async function main(): Promise<void> {
  const origin = String(process.env.API_ORIGIN ?? "http://localhost:3003").replace(/\/+$/, "");
  console.log(`Smoke test: POST ${origin}/api/job/appraise-preview`);

  const resp = await fetch(`${origin}/api/job/appraise-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(BODY),
    cache: "no-store",
  });

  if (resp.status !== 200) {
    const text = await resp.text();
    console.error(`[FAIL] Expected 200, got ${resp.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }

  const json = (await resp.json()) as Record<string, unknown>;
  if (
    !json.priceRange ||
    typeof (json.priceRange as { low?: number }).low !== "number" ||
    typeof (json.priceRange as { high?: number }).high !== "number"
  ) {
    console.error("[FAIL] Missing or invalid priceRange");
    process.exit(1);
  }
  if (typeof json.suggestedTotal !== "number") {
    console.error("[FAIL] Missing or invalid suggestedTotal");
    process.exit(1);
  }
  if (typeof json.rationale !== "string") {
    console.error("[FAIL] Missing or invalid rationale");
    process.exit(1);
  }
  if (json.modelUsed !== "gpt-5-nano" || json.promptVersion !== "job-appraisal-v4.0") {
    console.error("[FAIL] Unexpected modelUsed or promptVersion");
    process.exit(1);
  }

  // Plumbing + regional: 200 + 50 + 75 = 325
  const expected = 325;
  const actual = json.suggestedTotal as number;
  if (Math.abs(actual - expected) > 10) {
    console.error(`[FAIL] Expected suggestedTotal ~${expected}, got ${actual}`);
    process.exit(1);
  }

  console.log("[PASS] POST /api/job/appraise-preview → 200");
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error(String((err as Error)?.message ?? err));
  process.exit(1);
});

export {};
