#!/usr/bin/env tsx
/**
 * AI Appraisal smoke test — GPT-5 Nano backend.
 * Run: DOTENV_CONFIG_PATH=.env.local pnpm exec tsx scripts/ai-appraisal-smoke-test.ts
 *
 * Validates:
 * - OPEN_AI_API_KEY present
 * - Model reachable
 * - Response format (suggestedTotal, priceRange, confidence)
 * - No silent fallback to boilerplate
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const testPayload = {
  category: "drywall",
  description: "Patch 3 medium drywall holes, sand, repaint.",
  region: "Vancouver, BC",
  urgency: "standard",
};

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AI APPRAISAL SMOKE TEST (GPT-5 Nano)");
  console.log("═══════════════════════════════════════════════════════════\n");

  const key = process.env.OPEN_AI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key?.trim()) {
    console.error("[FAIL] OPEN_AI_API_KEY missing");
    process.exit(1);
  }
  console.log("[PASS] OPEN_AI_API_KEY present");

  const { appraiseJobTotalWithAi } = await import("../src/pricing/jobPricingAppraisal");

  const input = {
    title: "Drywall patch and repaint",
    tradeCategory: testPayload.category,
    city: "Vancouver",
    stateProvince: testPayload.region,
    country: "CA" as const,
    currency: "CAD" as const,
    jobType: "urban" as const,
    estimatedDurationHours: null,
    description: testPayload.description,
    propertyType: "unknown" as const,
    currentTotalDollars: 0,
  };

  console.log("\nCalling appraiseJobTotalWithAi with:", JSON.stringify(input, null, 2));

  try {
    const result = await appraiseJobTotalWithAi(input);
    console.log("\n[PASS] API call succeeded");
    console.log("Model:", result.model);
    console.log("Output:", JSON.stringify(result.output, null, 2));

    const o = result.output;
    if (!Number.isFinite(o?.suggestedTotal)) {
      console.error("[FAIL] suggestedTotal missing or invalid");
      process.exit(1);
    }
    if (!o?.priceRange?.low || !o?.priceRange?.high) {
      console.error("[FAIL] priceRange.low/high missing");
      process.exit(1);
    }
    if (!Number.isFinite(o?.confidence) || o.confidence < 0 || o.confidence > 1) {
      console.error("[FAIL] confidence invalid (must be 0..1)");
      process.exit(1);
    }

    console.log("\n[PASS] Response format valid");
    console.log("  suggestedTotal:", o.suggestedTotal);
    console.log("  priceRange:", o.priceRange);
    console.log("  confidence:", o.confidence);
    console.log("  reasoning:", (o.reasoning ?? "").slice(0, 80) + "...");

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  AI APPRAISAL SMOKE TEST: PASS");
    console.log("═══════════════════════════════════════════════════════════");
  } catch (err: any) {
    console.error("\n[FAIL] AI Appraisal error:", err?.message ?? err);
    if (err?.code === "AI_CONFIG_MISSING") {
      console.error("  → Return 500 (config error)");
    } else if (err?.code === "AI_RUNTIME_ERROR" || err?.code === "AI_INVALID_RESPONSE") {
      console.error("  → Return 502/503 (AI unavailable)");
    }
    process.exit(1);
  }
}

main();
