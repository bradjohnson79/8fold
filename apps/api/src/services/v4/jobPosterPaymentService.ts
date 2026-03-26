import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { stripe } from "@/src/payments/stripe";
import { getWebOrigin } from "@/src/server/bootConfig";

const WEB_ORIGIN = getWebOrigin();

export type PaymentStatus = {
  connected: boolean;
  providerReady: boolean;
  stripeStatus: "CONNECTED" | "NOT_CONNECTED";
  lastFour?: string;
  stripeUpdatedAt?: string | null;
};

function deriveConnection(input: {
  stripeDefaultPaymentMethodId: string | null | undefined;
  stripeStatus: string | null | undefined;
}): { connected: boolean; normalizedStripeStatus: "CONNECTED" | "NOT_CONNECTED"; paymentMethodId: string | null } {
  const paymentMethodId = String(input.stripeDefaultPaymentMethodId ?? "").trim() || null;
  const stripeStatusUpper = String(input.stripeStatus ?? "").trim().toUpperCase();
  const connectedStatuses = new Set(["CONNECTED", "ACTIVE"]);

  const connected = Boolean(paymentMethodId && (stripeStatusUpper === "" || connectedStatuses.has(stripeStatusUpper)));
  return {
    connected,
    normalizedStripeStatus: connected ? "CONNECTED" : "NOT_CONNECTED",
    paymentMethodId,
  };
}

function setupCurrencyForCountry(country: string | null | undefined): "usd" | "cad" {
  return String(country ?? "").toUpperCase() === "CA" ? "cad" : "usd";
}

async function createAndPersistStripeCustomer(userId: string): Promise<string> {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });

  const customer = await stripe.customers.create({
    metadata: { userId },
  });

  const now = new Date();
  await db
    .update(users)
    .set({
      stripeCustomerId: customer.id,
      stripeUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  return customer.id;
}

function isMissingCustomerError(err: unknown): boolean {
  const e = err as any;
  const code = String(e?.code ?? e?.raw?.code ?? "");
  const param = String(e?.param ?? e?.raw?.param ?? "");
  return code === "resource_missing" && param === "customer";
}

export async function getJobPosterPaymentStatus(userId: string): Promise<PaymentStatus> {
  const rows = await db
    .select({
      stripeCustomerId: users.stripeCustomerId,
      stripeDefaultPaymentMethodId: users.stripeDefaultPaymentMethodId,
      stripeStatus: users.stripeStatus,
      stripeUpdatedAt: users.stripeUpdatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const u = rows[0] ?? null;
  const derived = deriveConnection({
    stripeDefaultPaymentMethodId: u?.stripeDefaultPaymentMethodId,
    stripeStatus: u?.stripeStatus,
  });
  const connected = derived.connected;
  let lastFour: string | undefined;

  if (connected && derived.paymentMethodId && stripe) {
    try {
      const pm = await stripe.paymentMethods.retrieve(derived.paymentMethodId);
      lastFour = (pm as any).card?.last4 ?? undefined;
    } catch {
      /* ignore */
    }
  }

  return {
    connected,
    providerReady: Boolean(stripe),
    stripeStatus: derived.normalizedStripeStatus,
    lastFour,
    stripeUpdatedAt: u?.stripeUpdatedAt?.toISOString?.() ?? null,
  };
}

export async function ensureJobPosterStripeCustomer(userId: string): Promise<{ customerId: string }> {
  const rows = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const existing = rows[0]?.stripeCustomerId?.trim();
  if (existing) return { customerId: existing };
  return { customerId: await createAndPersistStripeCustomer(userId) };
}

export async function createJobPosterSetupSession(userId: string): Promise<{ url: string }> {
  const stripeClient = stripe;
  if (!stripeClient) throw Object.assign(new Error("Stripe not configured"), { status: 500 });

  const [userRow] = await db
    .select({ country: users.country })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const currency = setupCurrencyForCountry(userRow?.country);

  const createSession = async (customerId: string) => {
    return await stripeClient.checkout.sessions.create({
      mode: "setup",
      currency,
      customer: customerId,
      metadata: { userId },
      success_url: `${WEB_ORIGIN}/dashboard/job-poster/payment?success=1`,
      cancel_url: `${WEB_ORIGIN}/dashboard/job-poster/payment?canceled=1`,
    });
  };

  const { customerId } = await ensureJobPosterStripeCustomer(userId);
  try {
    let session = await createSession(customerId);
    if (!session?.url) throw Object.assign(new Error("Stripe session missing url"), { status: 500 });
    return { url: session.url };
  } catch (err) {
    if (!isMissingCustomerError(err)) {
      const msg = (err as Error)?.message ?? "Stripe error";
      throw Object.assign(new Error(msg), { status: 500 });
    }

    // Customer ID exists in DB but no longer exists in Stripe account; recreate and retry once.
    const replacementCustomerId = await createAndPersistStripeCustomer(userId);
    try {
      const session = await createSession(replacementCustomerId);
      if (!session?.url) throw Object.assign(new Error("Stripe session missing url"), { status: 500 });
      return { url: session.url };
    } catch (retryErr) {
      const msg = (retryErr as Error)?.message ?? "Stripe error";
      throw Object.assign(new Error(msg), { status: 500 });
    }
  }
}
