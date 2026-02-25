import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { users } from "@/db/schema/user";
import { stripe } from "@/src/payments/stripe";

const WEB_ORIGIN = String(process.env.WEB_ORIGIN ?? "").trim().replace(/\/+$/, "");
const COUNTRY_TO_CURRENCY: Record<string, "cad" | "usd"> = {
  CA: "cad",
  US: "usd",
};

type SupportedCurrency = "cad" | "usd";

export type PaymentStatus = {
  connected: boolean;
  stripeStatus: "CONNECTED" | "NOT_CONNECTED";
  currency: SupportedCurrency;
  lastFour?: string;
  stripeUpdatedAt?: string | null;
};

export type SetupIntentPayload = {
  clientSecret: string;
  currency: SupportedCurrency;
};

function normalizeCountryCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function resolveCurrency(countryCode: string): SupportedCurrency {
  const currency = COUNTRY_TO_CURRENCY[normalizeCountryCode(countryCode)];
  if (!currency) {
    throw Object.assign(new Error(`Unsupported country for Stripe: ${countryCode}`), { status: 400 });
  }
  return currency;
}

async function getJobPosterCurrency(userId: string): Promise<SupportedCurrency> {
  const rows = await db
    .select({ countryCode: jobPosterProfilesV4.country })
    .from(jobPosterProfilesV4)
    .where(eq(jobPosterProfilesV4.userId, userId))
    .limit(1);
  const countryCode = normalizeCountryCode(rows[0]?.countryCode);
  if (!countryCode) {
    throw Object.assign(new Error("Job Poster countryCode not configured"), { status: 400 });
  }
  return resolveCurrency(countryCode);
}

async function createAndPersistStripeCustomer(userId: string): Promise<string> {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });

  const rows = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const userRow = rows[0] ?? null;

  const customer = await stripe.customers.create({
    email: userRow?.email ?? undefined,
    name: userRow?.name ?? undefined,
    metadata: { userId },
  });

  const now = new Date();
  await db
    .update(users)
    .set({
      stripeCustomerId: customer.id,
      stripeStatus: "NOT_CONNECTED",
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

async function customerExistsInCurrentStripeAccount(customerId: string): Promise<boolean> {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ("deleted" in customer && customer.deleted) return false;
    return true;
  } catch {
    return false;
  }
}

export async function getJobPosterPaymentStatus(userId: string): Promise<PaymentStatus> {
  const currency = await getJobPosterCurrency(userId);
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
    currency,
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
  if (!rows[0]) throw Object.assign(new Error("User not found"), { status: 404 });

  let customerId = rows[0].stripeCustomerId?.trim() || null;

  if (customerId) {
    const exists = await customerExistsInCurrentStripeAccount(customerId);
    if (!exists) customerId = null;
  }

  if (!customerId) {
    customerId = await createAndPersistStripeCustomer(userId);
  }

  return { customerId };
}

export async function createJobPosterSetupSession(userId: string): Promise<{ url: string }> {
  const stripeClient = stripe;
  if (!stripeClient) throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  if (!WEB_ORIGIN) throw Object.assign(new Error("WEB_ORIGIN not configured"), { status: 500 });

  const createSession = async (customerId: string) => {
    return await stripeClient.checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["card"],
      customer: customerId,
      metadata: { userId },
      success_url: `${WEB_ORIGIN}/dashboard/job-poster/payment?success=1`,
      cancel_url: `${WEB_ORIGIN}/dashboard/job-poster/payment?canceled=1`,
    });
  };

  const { customerId } = await ensureJobPosterStripeCustomer(userId);
  try {
    const session = await createSession(customerId);
    if (!session?.url) throw Object.assign(new Error("Stripe session missing url"), { status: 500 });
    return { url: session.url };
  } catch (err) {
    if (!isMissingCustomerError(err)) {
      const msg = (err as Error)?.message ?? "Stripe error";
      throw Object.assign(new Error(msg), { status: 500 });
    }

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

export async function createJobPosterSetupIntent(userId: string): Promise<SetupIntentPayload> {
  const stripeClient = stripe;
  if (!stripeClient) throw Object.assign(new Error("Stripe not configured"), { status: 500 });

  const currency = await getJobPosterCurrency(userId);
  // TODO(v4): use this deterministic currency resolver for payment intents during job activation.
  const createIntent = async (customerId: string) => {
    return await stripeClient.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { userId },
    });
  };

  const { customerId } = await ensureJobPosterStripeCustomer(userId);
  try {
    const intent = await createIntent(customerId);
    if (!intent.client_secret) {
      throw Object.assign(new Error("Stripe setup intent missing client_secret"), { status: 500 });
    }
    return { clientSecret: intent.client_secret, currency };
  } catch (err) {
    if (!isMissingCustomerError(err)) {
      const msg = (err as Error)?.message ?? "Stripe error";
      throw Object.assign(new Error(msg), { status: 500 });
    }

    const replacementCustomerId = await createAndPersistStripeCustomer(userId);
    try {
      const intent = await createIntent(replacementCustomerId);
      if (!intent.client_secret) {
        throw Object.assign(new Error("Stripe setup intent missing client_secret"), { status: 500 });
      }
      return { clientSecret: intent.client_secret, currency };
    } catch (retryErr) {
      const msg = (retryErr as Error)?.message ?? "Stripe error";
      throw Object.assign(new Error(msg), { status: 500 });
    }
  }
}
