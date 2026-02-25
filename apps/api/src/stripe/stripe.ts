import Stripe from "stripe";
import { desc, isNotNull } from "drizzle-orm";
import { assertStripeKeysMatchMode, getStripeModeFromEnv, logStripeModeOnce } from "./mode";
import { db } from "../../db/drizzle";
import { stripeWebhookEvents } from "../../db/schema/stripeWebhookEvent";

// Stripe runtime env diagnosis (inspection only)
// eslint-disable-next-line no-console
console.log("Stripe initialization check:");
// eslint-disable-next-line no-console
console.log("STRIPE_SECRET_KEY present at import:", !!process.env.STRIPE_SECRET_KEY);

let warnedMissingKey = false;
let envChecked = false;
let webhookCheckStarted = false;
let stripeClient: Stripe | null = null;

function getStripeSecretKey(): string | null {
  const key = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  return key ? key : null;
}

export function assertStripeEnv(): void {
  if (envChecked) return;
  envChecked = true;
  const stripeSecretKey = getStripeSecretKey();
  const stripeMode = getStripeModeFromEnv();
  logStripeModeOnce(stripeMode);
  assertStripeKeysMatchMode({
    mode: stripeMode,
    secretKey: stripeSecretKey ?? null,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  });
}

export function getStripeClient(): Stripe | null {
  const stripeSecretKey = getStripeSecretKey();
  if (!stripeSecretKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("STRIPE_SECRET_KEY is required in production");
    }
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      // eslint-disable-next-line no-console
      console.warn("[stripe] STRIPE_SECRET_KEY not set. Stripe integration will fail.");
    }
    return null;
  }

  assertStripeEnv();
  if (!stripeClient) {
    stripeClient = new Stripe(stripeSecretKey, {
      // Use SDK default API version. Explicit pinning to 2025-02-24.acacia can cause 500s
      // if the Stripe account has not activated that version. Let the SDK choose.
    });
  }
  if (!webhookCheckStarted) {
    webhookCheckStarted = true;
    void verifyWebhookEndpointInDev();
  }
  return stripeClient;
}

export const stripe: Stripe | null = getStripeSecretKey()
  ? (new Proxy({} as Stripe, {
      get(_target, prop) {
        const client = getStripeClient();
        if (!client) return undefined;
        const value = (client as any)[prop];
        return typeof value === "function" ? value.bind(client) : value;
      },
    }) as Stripe)
  : null;

async function verifyWebhookEndpointInDev(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  const webhookSecretPresent = Boolean(String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim());
  const stripeMode = getStripeModeFromEnv();
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

