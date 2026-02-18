import Stripe from "stripe";
import crypto from "crypto";
import { assertStripeMinimumAmount, normalizeStripeCurrency } from "../stripe/validation";
import { assertStripeKeysMatchMode, getStripeModeFromEnv, logStripeModeOnce } from "../stripe/mode";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
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
      // Pin an API version (do not rely on Stripe dashboard "latest" in production).
      // If you upgrade Stripe API version, do it intentionally and test webhooks.
      apiVersion: "2025-02-24.acacia"
    })
  : null;

export type PaymentIntentResult = {
  clientSecret: string;
  paymentIntentId: string;
  status: Stripe.PaymentIntent.Status;
};

/**
 * Create a Stripe payment intent
 */
export async function createPaymentIntent(
  amountCents: number,
  opts: {
    currency: "usd" | "cad";
    metadata?: Record<string, string>;
    idempotencyKey: string;
  }
): Promise<PaymentIntentResult> {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error("Invalid amount"), { status: 400 });
  }
  const currency = normalizeStripeCurrency(opts.currency);
  assertStripeMinimumAmount(amountCents, currency);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency,
      metadata: opts.metadata ?? {},
      // Escrow-style approach:
      // - We capture funds into the platform account
      // - We DO NOT split at charge time (transfers happen later, controlled by backend)
      automatic_payment_methods: { enabled: true }
    },
    { idempotencyKey: opts.idempotencyKey }
  );

  if (!paymentIntent.client_secret) {
    throw Object.assign(new Error("Stripe payment intent missing client_secret"), { status: 500 });
  }

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status
  };
}

export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }
  await stripe.paymentIntents.cancel(paymentIntentId);
}

/**
 * Verify that a payment intent was successfully completed
 */
export async function verifyPaymentIntent(
  paymentIntentId: string
): Promise<{
  status: Stripe.PaymentIntent.Status;
  amount: number;
  latestChargeId: string | null;
}> {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  return {
    amount: paymentIntent.amount,
    status: paymentIntent.status,
    latestChargeId:
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id ?? null
  };
}

export async function refundCharge(opts: {
  chargeId: string;
  amountCents: number;
  reason?: Stripe.RefundCreateParams.Reason;
}): Promise<{ refundId: string; status: string }> {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }
  if (!opts.chargeId) throw Object.assign(new Error("Missing chargeId"), { status: 400 });
  if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0) throw Object.assign(new Error("Invalid amount"), { status: 400 });

  const refund = await stripe.refunds.create({
    charge: opts.chargeId,
    amount: opts.amountCents,
    reason: opts.reason
  });
  return { refundId: refund.id, status: refund.status ?? "unknown" };
}
