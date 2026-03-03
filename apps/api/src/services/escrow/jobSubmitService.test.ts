import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { jobPayments } from "@/db/schema/jobPayment";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { v4JobUploads } from "@/db/schema/v4JobUpload";
import { stripe } from "@/src/payments/stripe";
import { writeAuthHoldLedger, writeChargeLedger } from "@/src/services/escrow/ledger";
import { getFeeConfig } from "@/src/services/v4/paymentFeeConfigService";
import { computeModelAPricing } from "@/src/services/v4/modelAPricingService";
import { TRADE_CATEGORIES_CANONICAL } from "@/src/validation/v4/constants";

type LooseRecord = Record<string, unknown>;
type UploadInput = { uploadId: string; url: string };

type SubmitResult = {
  jobId: string;
  created: boolean;
};

type LedgerCurrency = "CAD" | "USD";

function toLedgerCurrency(value: unknown): LedgerCurrency {
  const c = String(value ?? "").trim().toUpperCase();
  if (c === "CAD" || c === "USD") return c;
  throw Object.assign(new Error(`Unsupported currency for ledger: ${c}`), {
    status: 409,
    code: "UNSUPPORTED_CURRENCY",
  });
}

function asObject(v: unknown): LooseRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as LooseRecord) : {};
}

function parseImages(value: unknown): UploadInput[] {
  if (!Array.isArray(value)) return [];
  const out: UploadInput[] = [];
  for (const item of value) {
    const obj = asObject(item);
    const uploadId = String(obj.uploadId ?? "").trim();
    const url = String(obj.url ?? "").trim();
    if (!uploadId) continue;
    out.push({ uploadId, url });
  }
  return out;
}

export async function submitJobFromPayload(
  userId: string,
  payload: unknown
): Promise<SubmitResult> {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured."), { status: 500 });
  }

  const body = asObject(payload);
  const details = asObject(body.details);
  const pricing = asObject(body.pricing);
  const payment = asObject(body.payment);

  const paymentIntentId = String(payment.paymentIntentId ?? "").trim();
  if (!paymentIntentId) {
    throw Object.assign(new Error("Payment intent required."), { status: 409 });
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (!pi || !pi.status) {
    throw Object.assign(new Error("Invalid Stripe payment intent."), { status: 409 });
  }

  const isCaptured = pi.status === "succeeded";
  const isAuthorized = pi.status === "requires_capture";

  if (!isCaptured && !isAuthorized) {
    throw Object.assign(new Error("Payment not completed."), { status: 409 });
  }

  const ledgerCurrency = toLedgerCurrency(pi.currency);

  const stripeAmountCents =
    typeof pi.amount_received === "number" && pi.amount_received > 0
      ? pi.amount_received
      : pi.amount ?? 0;

  if (!stripeAmountCents || stripeAmountCents <= 0) {
    throw Object.assign(new Error("Invalid Stripe amount."), { status: 409 });
  }

  const title = String(details.title ?? "").trim();
  const scope = String(details.description ?? "").trim();
  const tradeCategory = String(details.tradeCategory ?? "").toUpperCase();

  if (!TRADE_CATEGORIES_CANONICAL.includes(tradeCategory as any)) {
    throw Object.assign(new Error("Invalid trade category."), { status: 400 });
  }

  if (!title || !scope) {
    throw Object.assign(new Error("Missing job title or description."), { status: 400 });
  }

  const jobId = randomUUID();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(jobs).values({
      id: jobId,
      title,
      scope,
      trade_category: tradeCategory,
      status: "OPEN_FOR_ROUTING",
      routing_status: "UNROUTED",
      archived: false,
      job_poster_user_id: userId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_intent_status: pi.status,
      amount_cents: stripeAmountCents,
      total_amount_cents: stripeAmountCents,
      payment_status: isCaptured ? "FUNDS_SECURED" : "AUTHORIZED",
      currency: ledgerCurrency,
      payment_currency: ledgerCurrency,
      created_at: now,
      updated_at: now,
      posted_at: now,
    } as any);

    await tx.insert(jobPayments).values({
      id: randomUUID(),
      jobId,
      stripePaymentIntentId: paymentIntentId,
      stripePaymentIntentStatus: pi.status,
      amountCents: stripeAmountCents,
      status: isCaptured ? "CAPTURED" : "PENDING",
      paymentCapturedAt: isCaptured ? now : null,
      escrowLockedAt: isCaptured ? now : null,
      createdAt: now,
      updatedAt: now,
    } as any);

    if (isCaptured) {
      await writeChargeLedger(tx, {
        jobId,
        totalAmountCents: stripeAmountCents,
        currency: ledgerCurrency,
        paymentIntentId,
      });
    } else {
      await writeAuthHoldLedger(tx, {
        jobId,
        totalAmountCents: stripeAmountCents,
        currency: ledgerCurrency,
        paymentIntentId,
      });
    }
  });

  return { jobId, created: true };
}
