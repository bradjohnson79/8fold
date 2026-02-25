import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema/user";
import { stripe } from "@/src/payments/stripe";

const WEB_ORIGIN = String(process.env.WEB_ORIGIN ?? "").trim().replace(/\/+$/, "");

export type PaymentStatus = {
  connected: boolean;
  stripeStatus: "CONNECTED" | "NOT_CONNECTED";
  lastFour?: string;
  stripeUpdatedAt?: string | null;
};

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
  const connected = Boolean(u?.stripeDefaultPaymentMethodId && u?.stripeStatus === "CONNECTED");
  let lastFour: string | undefined;

  if (connected && u?.stripeDefaultPaymentMethodId && stripe) {
    try {
      const pm = await stripe.paymentMethods.retrieve(u.stripeDefaultPaymentMethodId);
      lastFour = (pm as any).card?.last4 ?? undefined;
    } catch {
      /* ignore */
    }
  }

  return {
    connected,
    stripeStatus: (u?.stripeStatus as "CONNECTED" | "NOT_CONNECTED") ?? "NOT_CONNECTED",
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
  if (!WEB_ORIGIN) throw Object.assign(new Error("WEB_ORIGIN not configured"), { status: 500 });

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
