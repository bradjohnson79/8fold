import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
import { stripe } from "@/src/payments/stripe";

type RawMeta = Record<string, unknown>;

type JobContext = {
  id: string;
  title: string | null;
  jobPosterUserId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
};

type UserContext = {
  id: string;
  name: string | null;
  email: string | null;
};

function asRecord(value: unknown): RawMeta {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawMeta) : {};
}

function stringOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function numberOrNull(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function upperCurrency(value: unknown): string | null {
  const normalized = stringOrNull(value)?.toUpperCase() ?? null;
  return normalized || null;
}

function formatAmount(amountCents: number | null, currency: string | null): string {
  if (!Number.isFinite(amountCents) || amountCents == null || amountCents < 0) return "";
  const safeCurrency = upperCurrency(currency) ?? "USD";
  try {
    return `${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountCents / 100)} ${safeCurrency}`;
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${safeCurrency}`;
  }
}

function formatTimestamp(value: Date | null): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

function refundDateFromStripe(refund: Stripe.Refund | null, fallback: RawMeta): Date | null {
  if (refund && Number.isFinite(Number(refund.created))) {
    return new Date(Number(refund.created) * 1000);
  }
  const fromMeta = stringOrNull(fallback.refundTimestamp ?? fallback.refund_timestamp ?? fallback.createdAt);
  if (!fromMeta) return null;
  const parsed = new Date(fromMeta);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadJobContext(args: {
  jobId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
}): Promise<JobContext | null> {
  if (args.jobId) {
    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        jobPosterUserId: jobs.job_poster_user_id,
        stripePaymentIntentId: jobs.stripe_payment_intent_id,
        stripeChargeId: jobs.stripe_charge_id,
      })
      .from(jobs)
      .where(eq(jobs.id, args.jobId))
      .limit(1);
    return rows[0] ?? null;
  }

  if (args.paymentIntentId) {
    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        jobPosterUserId: jobs.job_poster_user_id,
        stripePaymentIntentId: jobs.stripe_payment_intent_id,
        stripeChargeId: jobs.stripe_charge_id,
      })
      .from(jobs)
      .where(eq(jobs.stripe_payment_intent_id, args.paymentIntentId))
      .limit(1);
    return rows[0] ?? null;
  }

  if (args.chargeId) {
    const rows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        jobPosterUserId: jobs.job_poster_user_id,
        stripePaymentIntentId: jobs.stripe_payment_intent_id,
        stripeChargeId: jobs.stripe_charge_id,
      })
      .from(jobs)
      .where(eq(jobs.stripe_charge_id, args.chargeId))
      .limit(1);
    return rows[0] ?? null;
  }

  return null;
}

async function loadUserContext(userId: string | null): Promise<UserContext | null> {
  if (!userId) return null;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

async function retrieveRefund(refundId: string | null): Promise<Stripe.Refund | null> {
  if (!refundId || !stripe) return null;
  try {
    return await stripe.refunds.retrieve(refundId);
  } catch (error) {
    console.error("[REFUND_EMAIL_METADATA_REFUND_LOOKUP_FAILED]", {
      refundId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function retrieveCharge(chargeId: string | null): Promise<Stripe.Charge | null> {
  if (!chargeId || !stripe) return null;
  try {
    return await stripe.charges.retrieve(chargeId);
  } catch (error) {
    console.error("[REFUND_EMAIL_METADATA_CHARGE_LOOKUP_FAILED]", {
      chargeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function hydrateRefundEmailMetadata(input: {
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<Record<string, string>> {
  const meta = asRecord(input.metadata);
  const refundId = stringOrNull(meta.refundId ?? meta.refund_id);
  const refund = await retrieveRefund(refundId);

  const paymentIntentId =
    stringOrNull(refund?.payment_intent) ??
    stringOrNull(meta.stripePaymentIntentId ?? meta.stripe_payment_intent_id ?? meta.paymentIntentId ?? meta.payment_intent_id);
  const chargeId =
    stringOrNull(refund?.charge) ??
    stringOrNull(meta.chargeId ?? meta.charge_id ?? meta.stripeChargeId ?? meta.stripe_charge_id);

  const charge = await retrieveCharge(chargeId);
  const jobContext = await loadJobContext({
    jobId: stringOrNull(meta.jobId ?? meta.job_id),
    paymentIntentId,
    chargeId,
  });
  const userContext = await loadUserContext(stringOrNull(input.userId) ?? jobContext?.jobPosterUserId ?? null);

  const refundAmountCents =
    numberOrNull(refund?.amount) ??
    numberOrNull(meta.refundAmountCents ?? meta.refund_amount_cents ?? meta.amountCents ?? meta.amount_cents);
  const currency =
    upperCurrency(refund?.currency) ??
    upperCurrency(meta.currency ?? meta.refundCurrency ?? meta.refund_currency);
  const refundDate = refundDateFromStripe(refund, meta);
  const cardLast4 =
    stringOrNull(charge?.payment_method_details?.card?.last4) ??
    stringOrNull((charge?.payment_method_details as any)?.us_bank_account?.last4) ??
    stringOrNull(meta.cardLast4 ?? meta.card_last4);

  const raw: Record<string, string> = Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, String(value ?? "")]));
  const jobTitle = stringOrNull(jobContext?.title ?? meta.jobTitle ?? meta.job_title);
  const refundReference = stringOrNull(refund?.id) ?? refundId ?? "";
  const refundAmount = formatAmount(refundAmountCents, currency);
  const refundTimestamp = formatTimestamp(refundDate);
  const userName = stringOrNull(userContext?.name ?? meta.jobPosterName ?? meta.job_poster_name);
  const paymentMethodReference = cardLast4
    ? `Card ending in ${cardLast4}`
    : "Payment method details unavailable in Stripe.";

  return {
    ...raw,
    job_title: jobTitle ?? "",
    job_title_or_payment: jobTitle ? `"${jobTitle}"` : "your payment",
    job_poster_name: userName ?? "",
    greeting_name_suffix: userName ? ` ${userName}` : "",
    refund_amount: refundAmount,
    refund_amount_cents: refundAmountCents != null ? String(refundAmountCents) : "",
    refund_currency: currency ?? "",
    currency: currency ?? "",
    card_last4: cardLast4 ?? "",
    payment_method_reference: paymentMethodReference,
    refund_reference: refundReference,
    refund_id: refundReference,
    refund_timestamp: refundTimestamp,
    refund_timestamp_iso: refundDate?.toISOString() ?? "",
    stripe_payment_intent_id: paymentIntentId ?? jobContext?.stripePaymentIntentId ?? "",
    stripe_charge_id: chargeId ?? jobContext?.stripeChargeId ?? "",
    recipient_email: userContext?.email ?? "",
  };
}
