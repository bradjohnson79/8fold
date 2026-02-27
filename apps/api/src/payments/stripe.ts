import type Stripe from "stripe";
import { assertStripeMinimumAmount, normalizeStripeCurrency } from "../stripe/validation";
import { stripe } from "../stripe/stripe";
export { stripe };

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
    description?: string;
    captureMethod?: "automatic" | "manual";
    confirmationMethod?: "automatic" | "manual";
    requestExtendedAuthorization?: boolean;
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

  const createParams: Stripe.PaymentIntentCreateParams = {
    amount: amountCents,
    currency,
    metadata: opts.metadata ?? {},
    description: opts.description,
    capture_method: opts.captureMethod ?? "automatic",
    payment_method_options: opts.requestExtendedAuthorization
      ? {
          card: {
            request_extended_authorization: "if_available",
          },
        }
      : undefined,
    // Escrow-style approach:
    // - We capture funds into the platform account
    // - We DO NOT split at charge time (transfers happen later, controlled by backend)
    automatic_payment_methods: { enabled: true },
  };

  // Stripe can reject requests that combine automatic_payment_methods with explicit confirmation_method.
  // Keep this unset by default; only send when a caller explicitly asks for non-default behavior.
  if (opts.confirmationMethod && opts.confirmationMethod !== "automatic") {
    createParams.confirmation_method = opts.confirmationMethod;
  }

  const paymentIntent = await stripe.paymentIntents.create(createParams, { idempotencyKey: opts.idempotencyKey });

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

export async function refundPaymentIntent(opts: {
  paymentIntentId: string;
  amountCents?: number;
  reason?: Stripe.RefundCreateParams.Reason;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}): Promise<{ refundId: string; status: string }> {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }
  if (!opts.paymentIntentId) throw Object.assign(new Error("Missing paymentIntentId"), { status: 400 });

  const refund = await stripe.refunds.create(
    {
      payment_intent: opts.paymentIntentId,
      amount: opts.amountCents,
      reason: opts.reason,
      metadata: opts.metadata,
    },
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  );
  return { refundId: refund.id, status: refund.status ?? "unknown" };
}
