/**
 * verifyStripeEnvironment()
 *
 * Boot-time guard: call once during API startup (e.g. in instrumentation.ts or the
 * first request handler) to hard-fail early if the Stripe environment is misconfigured.
 *
 * Rules enforced:
 *   1. STRIPE_SECRET_KEY must be present in production.
 *   2. STRIPE_WEBHOOK_SECRET must be present in production.
 *   3. STRIPE_MODE must be "live" in production.
 *   4. Secret key prefix must match STRIPE_MODE (sk_live_ ↔ live, sk_test_ ↔ test).
 *   5. If NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY or STRIPE_PUBLISHABLE_KEY is present,
 *      its prefix must also match STRIPE_MODE (pk_live_ ↔ live, pk_test_ ↔ test).
 *   6. Live keys are forbidden in non-production environments (prevents accidental
 *      real charges during local dev or staging runs).
 *
 * On mismatch the function throws an Error with code "STRIPE_MODE_MISMATCH" or
 * "STRIPE_CONFIG_MISSING", allowing a clear startup crash rather than a silent
 * runtime failure during the first payment.
 */

import { getStripeRuntimeConfig } from "./runtimeConfig";

export type StripeEnvVerificationResult =
  | { ok: true; stripeMode: "live" | "test"; skMode: string; pkMode: string }
  | { ok: false; code: string; message: string };

export function verifyStripeEnvironment(
  env: Record<string, string | undefined> = process.env,
): StripeEnvVerificationResult {
  const isProduction = String(env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const config = getStripeRuntimeConfig(env);

  // ── 1. Missing key guard ────────────────────────────────────────────────────
  if (!config.secretKeyPresent) {
    const msg = "STRIPE_SECRET_KEY is not set.";
    if (isProduction) {
      throw Object.assign(new Error(msg), { code: "STRIPE_CONFIG_MISSING", status: 500 });
    }
    console.warn("[stripe:boot] WARNING:", msg);
    return { ok: false, code: "STRIPE_CONFIG_MISSING", message: msg };
  }

  // ── 2. Webhook secret guard ─────────────────────────────────────────────────
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!webhookSecret && isProduction) {
    const msg = "STRIPE_WEBHOOK_SECRET is not set in production.";
    throw Object.assign(new Error(msg), { code: "STRIPE_CONFIG_MISSING", status: 500 });
  }

  // ── 3. Non-production live key guard ────────────────────────────────────────
  const rawSk = String(env.STRIPE_SECRET_KEY ?? "").trim();
  if (!isProduction && rawSk.startsWith("sk_" + "live_")) {
    const msg =
      "Live Stripe secret key detected in a non-production environment. " +
      "Set NODE_ENV=production or switch to a test key.";
    throw Object.assign(new Error(msg), { code: "STRIPE_NONPROD_LIVE_KEY", status: 500 });
  }

  // ── 4 & 5. sk/pk mode mismatch guard ───────────────────────────────────────
  if (!config.ok) {
    const msg = config.errorMessage ?? "Stripe key/mode mismatch";
    const code = config.errorCode ?? "STRIPE_MODE_MISMATCH";
    if (isProduction) {
      throw Object.assign(new Error(msg), { code, status: 500 });
    }
    console.warn(`[stripe:boot] WARNING (${code}):`, msg);
    return { ok: false, code, message: msg };
  }

  // ── 6. Production must be live mode ────────────────────────────────────────
  if (isProduction && config.stripeMode !== "live") {
    const msg = `STRIPE_MODE is "${config.stripeMode}" in production — must be "live".`;
    throw Object.assign(new Error(msg), { code: "STRIPE_MODE_MISMATCH", status: 500 });
  }

  console.log(
    JSON.stringify({
      source: "stripe.boot",
      check: "verifyStripeEnvironment",
      ok: true,
      stripeMode: config.stripeMode,
      skMode: config.skMode,
      pkMode: config.pkMode,
      publishableKeyPresent: config.publishableKeyPresent,
      webhookSecretPresent: Boolean(webhookSecret),
    }),
  );

  return { ok: true, stripeMode: config.stripeMode, skMode: config.skMode, pkMode: config.pkMode };
}
