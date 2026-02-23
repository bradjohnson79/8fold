#!/usr/bin/env tsx
/**
 * Webhook Verify Script for Production
 *
 * - Prints env presence (no secret values)
 * - Lists last 5 payment_intent.succeeded events from Stripe API
 * - Optionally checks DB for StripeWebhookEvent rows (idempotency)
 * - Output: PASS/FAIL with reason
 *
 * Run: pnpm -C apps/api verify:webhook:live
 * Or:  DOTENV_CONFIG_PATH=apps/api/.env.local tsx apps/api/scripts/verifyStripeWebhookLive.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { stripeWebhookEvents } from "../db/schema/stripeWebhookEvent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");
dotenv.config({ path: envPath, override: true });

const PREFIX = "STRIPE_WEBHOOK_VERIFY";

function safePrefix(s: string, len = 6): string {
  if (!s) return "(not set)";
  return s.substring(0, len) + "...";
}

async function main() {
  console.log(`[${PREFIX}] Starting verification\n`);

  // 1. Env presence
  const sk = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  const wh = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const isLive = sk.startsWith("sk_live_");

  console.log("1. Env presence:");
  console.log(`   STRIPE_SECRET_KEY: ${sk ? safePrefix(sk) + " (present)" : "MISSING"}`);
  console.log(`   STRIPE_WEBHOOK_SECRET: ${wh ? safePrefix(wh) + " (present)" : "MISSING"}`);
  console.log(`   Mode: ${isLive ? "LIVE" : "TEST"}`);

  if (!sk || !wh) {
    console.log(`\n[${PREFIX}] FAIL: Required env vars missing`);
    process.exit(1);
  }

  const stripe = new Stripe(sk, { apiVersion: "2025-02-24.acacia" });

  // 2. List last 5 payment_intent.succeeded events
  let events: Stripe.Event[] = [];
  try {
    const list = await stripe.events.list({
      type: "payment_intent.succeeded",
      limit: 5,
    });
    events = list.data;
  } catch (err) {
    console.log(`\n[${PREFIX}] FAIL: Stripe API error listing events:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log(`\n2. Last 5 payment_intent.succeeded events (Stripe API):`);
  if (events.length === 0) {
    console.log("   (none found)");
  } else {
    for (const ev of events) {
      const created = typeof ev.created === "number" ? new Date(ev.created * 1000).toISOString() : "?";
      console.log(`   - ${ev.id} | created=${created} | livemode=${ev.livemode}`);
    }
  }

  // 3. Check DB for idempotency (StripeWebhookEvent)
  const eventIds = events.map((e) => e.id);
  const dbResults: Record<string, { found: boolean; processedAt?: string }> = {};

  try {
    for (const id of eventIds) {
      const rows = await db
        .select({ id: stripeWebhookEvents.id, processedAt: stripeWebhookEvents.processedAt })
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.id, id))
        .limit(1);
      const row = rows[0];
      dbResults[id] = {
        found: !!row,
        processedAt: row?.processedAt ? String(row.processedAt) : undefined,
      };
    }
  } catch (err) {
    console.log(`\n[${PREFIX}] WARN: DB check failed (schema may differ):`, err instanceof Error ? err.message : err);
  }

  if (Object.keys(dbResults).length > 0) {
    console.log(`\n3. DB idempotency (StripeWebhookEvent):`);
    for (const [id, r] of Object.entries(dbResults)) {
      console.log(`   - ${id}: ${r.found ? `found, processedAt=${r.processedAt ?? "null"}` : "not found"}`);
    }
  }

  // 4. PASS/FAIL
  const hasLiveEvents = events.some((e) => e.livemode);
  const hasAnyEvents = events.length > 0;
  const anyInDb = Object.values(dbResults).some((r) => r.found);

  if (isLive && !hasLiveEvents && hasAnyEvents) {
    console.log(`\n[${PREFIX}] WARN: Using LIVE key but listed events are TEST (livemode=false). Ensure Dashboard is in Live mode.`);
  }

  if (isLive && hasLiveEvents) {
    console.log(`\n[${PREFIX}] PASS: LIVE events found. Webhook delivery can be confirmed via Stripe Dashboard → Developers → Webhooks → [endpoint] → Recent deliveries.`);
  } else if (hasAnyEvents) {
    console.log(`\n[${PREFIX}] PASS: Events listed (mode=${isLive ? "live" : "test"}). For full launch gate: show evidence of one LIVE delivery returning 200.`);
  } else {
    console.log(`\n[${PREFIX}] WARN: No payment_intent.succeeded events. Create a real PaymentIntent and complete it to trigger LIVE events.`);
  }

  if (anyInDb) {
    console.log(`   Idempotency: at least one event present in StripeWebhookEvent table.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`[${PREFIX}] Error:`, err);
  process.exit(1);
});
