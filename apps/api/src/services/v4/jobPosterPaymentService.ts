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

  return { customerId: customer.id };
}

export async function createJobPosterSetupSession(userId: string): Promise<{ url: string }> {
  // Temporary diagnostic: confirm stripe client is null at runtime (env not available at module load time)
  if (!stripe) {
    throw new Error("Stripe client is null at runtime");
  }

  // Temporary debug logging for 500 root cause investigation
  // eslint-disable-next-line no-console
  console.log("Stripe key exists:", !!process.env.STRIPE_SECRET_KEY);
  // eslint-disable-next-line no-console
  console.log("APP_URL:", process.env.APP_URL);
  // eslint-disable-next-line no-console
  console.log("WEB_ORIGIN:", process.env.WEB_ORIGIN);

  const { customerId } = await ensureJobPosterStripeCustomer(userId);
  // eslint-disable-next-line no-console
  console.log("stripeCustomerId:", customerId ?? null);

  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  if (!WEB_ORIGIN) throw Object.assign(new Error("WEB_ORIGIN not configured"), { status: 500 });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      metadata: { userId },
      success_url: `${WEB_ORIGIN}/dashboard/job-poster/payment?success=1`,
      cancel_url: `${WEB_ORIGIN}/dashboard/job-poster/payment?canceled=1`,
    });

    const url = session.url;
    if (!url) throw Object.assign(new Error("Stripe session missing url"), { status: 500 });

    return { url };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Stripe Setup Error:", err);
    const msg = (err as Error)?.message ?? "Stripe error";
    throw Object.assign(new Error(msg), { status: 500 });
  }
}
