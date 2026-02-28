import Stripe from "stripe";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-02-24.acacia";

let stripeClient: Stripe | null = null;

function requireStripeSecret(): string {
  const key = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) throw Object.assign(new Error("STRIPE_SECRET_KEY is not configured"), { status: 500 });
  return key;
}

export function getStripeGatewayClient(): Stripe {
  if (stripeClient) return stripeClient;
  stripeClient = new Stripe(requireStripeSecret(), {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 10_000,
  });
  return stripeClient;
}

type DateRangeInput = { fromDate: Date; toDate: Date };

function createdRange(input: DateRangeInput): Stripe.RangeQueryParam {
  const gte = Math.floor(input.fromDate.getTime() / 1000);
  const lte = Math.floor(input.toDate.getTime() / 1000);
  return { gte, lte };
}

export async function fetchPaymentIntents(input: DateRangeInput): Promise<Stripe.PaymentIntent[]> {
  const stripe = getStripeGatewayClient();
  return await stripe.paymentIntents
    .list({ limit: 100, created: createdRange(input) })
    .autoPagingToArray({ limit: 10_000 });
}

export async function fetchCharges(input: DateRangeInput): Promise<Stripe.Charge[]> {
  const stripe = getStripeGatewayClient();
  return await stripe.charges
    .list({ limit: 100, created: createdRange(input) })
    .autoPagingToArray({ limit: 10_000 });
}

export async function fetchTransfers(input: DateRangeInput): Promise<Stripe.Transfer[]> {
  const stripe = getStripeGatewayClient();
  return await stripe.transfers
    .list({ limit: 100, created: createdRange(input) })
    .autoPagingToArray({ limit: 10_000 });
}

export async function fetchRefunds(input: DateRangeInput): Promise<Stripe.Refund[]> {
  const stripe = getStripeGatewayClient();
  return await stripe.refunds
    .list({ limit: 100, created: createdRange(input) })
    .autoPagingToArray({ limit: 10_000 });
}

export async function fetchSinglePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripeGatewayClient();
  return await stripe.paymentIntents.retrieve(id);
}
