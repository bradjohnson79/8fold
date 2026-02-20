import Stripe from "stripe";
import { desc, isNotNull } from "drizzle-orm";
import { assertStripeKeysMatchMode, getStripeModeFromEnv, logStripeModeOnce } from "./mode";
import { db } from "../../db/drizzle";
import { stripeWebhookEvents } from "../../db/schema/stripeWebhookEvent";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  // Fail fast in production so we don't limp along with `stripe=null` and 500s at runtime.
  if (process.env.NODE_ENV === "production") {
    throw new Error("STRIPE_SECRET_KEY is required in production");
  }
  // eslint-disable-next-line no-console
  console.warn("[stripe] STRIPE_SECRET_KEY not set. Stripe integration will fail.");
}

const stripeMode = getStripeModeFromEnv();
logStripeModeOnce(stripeMode);
assertStripeKeysMatchMode({
  mode: stripeMode,
  secretKey: stripeSecretKey ?? null,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
});

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      // Pin an API version (do not rely on Stripe dashboard "latest").
      apiVersion: "2025-02-24.acacia",
    })
  : null;

async function verifyWebhookEndpointInDev(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  const webhookSecretPresent = Boolean(String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim());
  let lastWebhookEventReceivedAt: string | null = null;

  try {
    const latest = await db
      .select({ processedAt: stripeWebhookEvents.processedAt })
      .from(stripeWebhookEvents)
      .where(isNotNull(stripeWebhookEvents.processedAt))
      .orderBy(desc(stripeWebhookEvents.processedAt))
      .limit(1);
    const processedAt = latest[0]?.processedAt ?? null;
    lastWebhookEventReceivedAt = processedAt ? processedAt.toISOString() : null;
  } catch {
    lastWebhookEventReceivedAt = null;
  }

  // Diagnostic-only readiness signal in non-production environments.
  // Do not hard-require dashboard endpoint registration in local/dev workflows.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      source: "stripe.startup",
      check: "webhook_readiness",
      webhookSecretPresent: webhookSecretPresent ? "yes" : "no",
      stripeMode: stripeMode === "live" ? "live" : "test",
      lastWebhookEventReceivedAt,
    }),
  );
}

void verifyWebhookEndpointInDev();

