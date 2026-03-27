import type Stripe from "stripe";

export type StripeChargeUiState = "paid" | "processing" | "unpaid" | "requires_action" | "failed";

export function normalizeStripePaymentIntentStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}

export function isStripePaymentIntentPaid(status: unknown): boolean {
  return normalizeStripePaymentIntentStatus(status) === "succeeded";
}

export function isStripePaymentIntentProcessing(status: unknown): boolean {
  return normalizeStripePaymentIntentStatus(status) === "processing";
}

export function toStripeChargeUiState(status: unknown): StripeChargeUiState {
  const normalized = normalizeStripePaymentIntentStatus(status);
  if (normalized === "succeeded") return "paid";
  if (normalized === "processing") return "processing";
  if (normalized === "requires_payment_method") return "unpaid";
  if (normalized === "requires_action") return "requires_action";
  return "failed";
}

export function toStoredJobPaymentStatusFromStripe(
  status: Stripe.PaymentIntent.Status | string | null | undefined,
): "FUNDS_SECURED" | "REQUIRES_ACTION" | "UNPAID" | "FAILED" {
  const normalized = normalizeStripePaymentIntentStatus(status);
  if (normalized === "succeeded") return "FUNDS_SECURED";
  if (normalized === "processing") return "FUNDS_SECURED";
  if (normalized === "requires_action") return "REQUIRES_ACTION";
  if (normalized === "requires_payment_method") return "UNPAID";
  return "FAILED";
}

export function isStoredJobPaymentPaid(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toUpperCase();
  return normalized === "FUNDS_SECURED" || normalized === "FUNDED";
}
