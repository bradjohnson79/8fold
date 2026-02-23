#!/usr/bin/env tsx
/**
 * Create a LIVE PaymentIntent for webhook verification (Path 2).
 *
 * WARNING: Uses LIVE key. Creates a real PaymentIntent. Minimal amount ($1).
 * Human action required: complete the payment (e.g. with test card 4242...) to trigger
 * payment_intent.succeeded in LIVE mode.
 *
 * Run: DOTENV_CONFIG_PATH=.env.local tsx scripts/createLivePaymentIntentForWebhookTest.ts
 *
 * Prerequisites:
 * - STRIPE_SECRET_KEY must be sk_live_*
 * - Webhook endpoint must be registered in Stripe LIVE
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const sk = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
if (!sk.startsWith("sk_live_")) {
  console.error("This script requires STRIPE_SECRET_KEY to be a LIVE key (sk_live_*).");
  process.exit(1);
}

const stripe = new Stripe(sk, { apiVersion: "2025-02-24.acacia" });

async function main() {
  console.log("Creating LIVE PaymentIntent for $1 USD (webhook test)...\n");

  const pi = await stripe.paymentIntents.create({
    amount: 100, // $1.00
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: { purpose: "webhook_verification_test" },
  });

  console.log("PaymentIntent created:");
  console.log("  id:", pi.id);
  console.log("  client_secret:", pi.client_secret?.slice(0, 20) + "...");
  console.log("  livemode:", pi.livemode);
  console.log("\nTo trigger payment_intent.succeeded:");
  console.log("  1. Use Stripe Dashboard → Payments → [this PaymentIntent] → Test payment");
  console.log("  2. Or use your frontend with the client_secret");
  console.log("  3. Complete with card 4242 4242 4242 4242");
  console.log("\nAfter completion, Stripe will send the webhook to your registered endpoint.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
