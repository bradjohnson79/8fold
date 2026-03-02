import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { appendLedgerEntry, existsByDedupeKey, getLatestLedgerAmountByType } from "@/src/services/v4/financialLedgerService";

type TxLike = {
  select: typeof db.select;
  insert: typeof db.insert;
};

type ReconcileInput = {
  pi: Stripe.PaymentIntent;
  stripeClient: Stripe | null;
  tx?: TxLike;
  source: string;
  webhookEventId?: string | null;
};

type ReconcileResult =
  | {
      ok: true;
      jobId: string;
      paymentIntentId: string;
      chargeId: string;
      balanceTransactionId: string;
      estimatedProcessingFeeCents: number;
      actualStripeFeeCents: number;
      processingFeeDeltaCents: number;
      netCents: number;
      amountCents: number;
      currency: string;
    }
  | {
      ok: false;
      code: string;
      reason: string;
      paymentIntentId: string;
      jobId?: string | null;
    };

function parseIntSafe(value: unknown): number {
  const parsed = Math.trunc(Number(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMetadataJobId(pi: Stripe.PaymentIntent): string | null {
  const type = String(pi.metadata?.type ?? "").trim();
  const jobId = String(pi.metadata?.jobId ?? "").trim();
  if (type !== "job_escrow" || !jobId) return null;
  return jobId;
}

function getLatestChargeId(pi: Stripe.PaymentIntent): string | null {
  if (typeof pi.latest_charge === "string") return pi.latest_charge;
  return pi.latest_charge?.id ?? null;
}

export async function reconcileStripeFeeForPaymentIntent(input: ReconcileInput): Promise<ReconcileResult> {
  const paymentIntentId = String(input.pi.id ?? "").trim();
  const stripeClient = input.stripeClient;
  if (!paymentIntentId) {
    return {
      ok: false,
      code: "V4_RECON_PI_MISSING",
      reason: "payment_intent_missing",
      paymentIntentId: "",
    };
  }
  if (!stripeClient) {
    return {
      ok: false,
      code: "V4_RECON_STRIPE_UNAVAILABLE",
      reason: "stripe_client_unavailable",
      paymentIntentId,
    };
  }

  let jobId = getMetadataJobId(input.pi);
  if (!jobId) {
    const jobRows = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.stripe_payment_intent_id, paymentIntentId))
      .limit(1);
    jobId = jobRows[0]?.id ?? null;
  }
  if (!jobId) {
    return {
      ok: false,
      code: "V4_RECON_JOB_METADATA_MISSING",
      reason: "missing_job_metadata_or_mapping",
      paymentIntentId,
      jobId: null,
    };
  }

  let chargeId = getLatestChargeId(input.pi);
  if (!chargeId) {
    const refreshed = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    chargeId = getLatestChargeId(refreshed);
  }
  if (!chargeId) {
    return {
      ok: false,
      code: "V4_RECON_CHARGE_MISSING",
      reason: "payment_intent_has_no_latest_charge",
      paymentIntentId,
      jobId,
    };
  }

  const charge = await stripeClient.charges.retrieve(chargeId, {
    expand: ["balance_transaction"],
  });
  const balanceTxnRaw = charge.balance_transaction as Stripe.BalanceTransaction | string | null | undefined;
  const balanceTxnId = typeof balanceTxnRaw === "string" ? balanceTxnRaw : balanceTxnRaw?.id ?? null;
  if (!balanceTxnId) {
    return {
      ok: false,
      code: "V4_RECON_BALANCE_TXN_MISSING",
      reason: "charge_missing_balance_transaction",
      paymentIntentId,
      jobId,
    };
  }

  const balanceTxn =
    typeof balanceTxnRaw === "string"
      ? await stripeClient.balanceTransactions.retrieve(balanceTxnRaw)
      : balanceTxnRaw;
  const actualStripeFeeCents = parseIntSafe(balanceTxn?.fee);
  const netCents = parseIntSafe(balanceTxn?.net);
  const amountCents = parseIntSafe(balanceTxn?.amount);
  const currency = String(balanceTxn?.currency ?? input.pi.currency ?? "").trim().toUpperCase() || "CAD";
  const feeActualDedupe = `stripe_fee_actual:${jobId}:${balanceTxnId}`;
  if (await existsByDedupeKey(feeActualDedupe, input.tx)) {
    return {
      ok: true,
      jobId,
      paymentIntentId,
      chargeId,
      balanceTransactionId: balanceTxnId,
      estimatedProcessingFeeCents: 0,
      actualStripeFeeCents,
      processingFeeDeltaCents: 0,
      netCents,
      amountCents,
      currency,
    };
  }

  let estimatedProcessingFeeCents =
    (await getLatestLedgerAmountByType({
      jobId,
      type: "PROCESSING_FEE_EST",
      stripeRef: paymentIntentId,
      tx: input.tx,
    })) ??
    (await getLatestLedgerAmountByType({
      jobId,
      type: "PROCESSING_FEE_EST",
      tx: input.tx,
    }));

  if (!Number.isInteger(estimatedProcessingFeeCents)) {
    const jobRows = await db
      .select({ transactionFeeCents: jobs.transaction_fee_cents })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    estimatedProcessingFeeCents = parseIntSafe(jobRows[0]?.transactionFeeCents);
  }

  const normalizedEstimatedProcessingFeeCents = parseIntSafe(estimatedProcessingFeeCents);
  const processingFeeDeltaCents = normalizedEstimatedProcessingFeeCents - actualStripeFeeCents;
  const estimatedMissing = normalizedEstimatedProcessingFeeCents <= 0;
  const netDedupe = `stripe_net:${jobId}:${balanceTxnId}`;
  const deltaDedupe = `proc_fee_delta:${jobId}:${balanceTxnId}`;
  const tx = input.tx;
  await appendLedgerEntry({
    jobId,
    type: "STRIPE_FEE_ACTUAL",
    amountCents: actualStripeFeeCents,
    currency,
    stripeRef: balanceTxnId,
    dedupeKey: feeActualDedupe,
    meta: {
      paymentIntentId,
      chargeId,
      source: input.source,
      webhookEventId: input.webhookEventId ?? null,
      estimatedMissing,
    },
    tx,
  });
  await appendLedgerEntry({
    jobId,
    type: "STRIPE_NET_RECEIVED",
    amountCents: netCents,
    currency,
    stripeRef: balanceTxnId,
    dedupeKey: netDedupe,
    meta: {
      paymentIntentId,
      chargeId,
      source: input.source,
      webhookEventId: input.webhookEventId ?? null,
      estimatedMissing,
    },
    tx,
  });
  await appendLedgerEntry({
    jobId,
    type: "PROCESSING_FEE_DELTA",
    amountCents: processingFeeDeltaCents,
    currency,
    stripeRef: balanceTxnId,
    dedupeKey: deltaDedupe,
    meta: {
      paymentIntentId,
      chargeId,
      estimatedProcessingFeeCents: normalizedEstimatedProcessingFeeCents,
      actualStripeFeeCents,
      source: input.source,
      webhookEventId: input.webhookEventId ?? null,
      estimatedMissing,
    },
    tx,
  });

  return {
    ok: true,
    jobId,
    paymentIntentId,
    chargeId,
    balanceTransactionId: balanceTxnId,
    estimatedProcessingFeeCents: normalizedEstimatedProcessingFeeCents,
    actualStripeFeeCents,
    processingFeeDeltaCents,
    netCents,
    amountCents,
    currency,
  };
}
