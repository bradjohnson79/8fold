#!/usr/bin/env npx ts-node
/**
 * Verify Stripe env vars for test mode (logs first 6 chars only, never full keys).
 * Run: DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx -r dotenv/config apps/api/scripts/verify-stripe-env.ts
 * Or from apps/api: pnpm exec tsx -r dotenv/config scripts/verify-stripe-env.ts
 * (dotenv loads .env.local when DOTENV_CONFIG_PATH is set)
 */

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY ?? "";
const sk = process.env.STRIPE_SECRET_KEY ?? "";
const wh = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const mode = process.env.STRIPE_MODE ?? "test";

function safePrefix(s: string, len = 6): string {
  if (!s) return "(not set)";
  return s.substring(0, len) + "...";
}

console.log("Stripe env verification (first 6 chars only):");
console.log("  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:", safePrefix(pk));
console.log("  STRIPE_SECRET_KEY:", safePrefix(sk));
console.log("  STRIPE_WEBHOOK_SECRET:", safePrefix(wh));
console.log("  STRIPE_MODE:", mode);

const pkTest = pk.startsWith("pk_test_");
const skTest = sk.startsWith("sk_test_");
const whOk = wh.startsWith("whsec_");

if (!pkTest && pk) console.warn("  WARN: Publishable key should start with pk_test_ for test mode");
if (!skTest && sk) console.warn("  WARN: Secret key should start with sk_test_ for test mode");
if (!whOk && wh) console.warn("  WARN: Webhook secret should start with whsec_");

if (pkTest && skTest && whOk) {
  console.log("  OK: Test mode keys detected");
} else if (!pk || !sk) {
  console.error("  FAIL: Required keys missing");
  process.exit(1);
}
