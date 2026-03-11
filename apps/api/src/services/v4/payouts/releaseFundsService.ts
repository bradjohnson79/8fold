import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4FinancialLedger } from "@/db/schema/v4FinancialLedger";
import { existsByDedupeKey, appendLedgerEntry } from "@/src/services/v4/financialLedgerService";
import {
  CONTRACTOR_TRANSFER_CREATED,
  FUNDS_RELEASED_FINAL,
  PAYOUT_RELEASE_INITIATED,
  PLATFORM_REVENUE_RECORDED,
  ROUTER_TRANSFER_CREATED,
  payoutDedupeKeys,
} from "@/src/services/v4/payouts/payoutLedgerTypes";
import {
  releaseJobFundsLegacyEngine,
  type ReleaseJobFundsResult,
} from "@/src/payouts/releaseJobFundsLegacyEngine";
import { stripe } from "@/src/stripe/stripe";

export type ReleaseFundsForJobInput = {
  jobId: string;
  actorRole: "ROUTER" | "ADMIN" | "SYSTEM";
  actorId: string;
};

export type ReleaseFundsForJobResult = {
  ok: boolean;
  code?: string;
  error?: string;
  jobId: string;
  alreadyReleased?: boolean;
  legs?: Array<{
    role: "CONTRACTOR" | "ROUTER" | "PLATFORM";
    method: "STRIPE";
    status: "SENT" | "FAILED";
    amountCents: number;
    currency: "USD" | "CAD";
    stripeTransferId?: string | null;
    externalRef?: string | null;
    failureReason?: string;
  }>;
};

type JobSnapshot = {
  id: string;
  status: string;
  routerApprovedAt: Date | null;
  paymentStatus: string;
  stripePaymentIntentId: string | null;
  currency: string | null;
  appraisalSubtotalCents: number;
  regionalFeeCents: number;
  amountCents: number;
};

function normalizeCurrency(raw: string | null | undefined): string {
  const normalized = String(raw ?? "CAD").trim().toUpperCase();
  if (!normalized) return "CAD";
  return normalized;
}

function computeBaseSplitCents(job: JobSnapshot): number {
  // Percentage splits apply to appraisalSubtotalCents only — the $20 regional fee goes flat to platform.
  const appraisal = Number(job.appraisalSubtotalCents ?? 0);
  if (Number.isFinite(appraisal) && appraisal > 0) {
    return Math.trunc(appraisal);
  }
  return Math.trunc(Number(job.amountCents ?? 0));
}

async function loadJob(jobId: string): Promise<JobSnapshot | null> {
  const rows = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      routerApprovedAt: jobs.router_approved_at,
      paymentStatus: jobs.payment_status,
      stripePaymentIntentId: jobs.stripe_payment_intent_id,
      currency: jobs.currency,
      appraisalSubtotalCents: jobs.appraisal_subtotal_cents,
      regionalFeeCents: jobs.regional_fee_cents,
      amountCents: jobs.amount_cents,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

async function hasCapturedEvidence(job: JobSnapshot): Promise<boolean> {
  const localEvidence = await db
    .select({ type: v4FinancialLedger.type })
    .from(v4FinancialLedger)
    .where(
      and(
        eq(v4FinancialLedger.jobId, job.id),
        inArray(v4FinancialLedger.type, ["STRIPE_NET_RECEIVED", "STRIPE_FEE_ACTUAL"]),
      ),
    )
    .limit(1);
  if (localEvidence.length > 0) return true;

  const paymentStatus = String(job.paymentStatus ?? "").toUpperCase();
  if (paymentStatus === "FUNDS_SECURED" || paymentStatus === "FUNDED") return true;

  const paymentIntentId = String(job.stripePaymentIntentId ?? "").trim();
  if (!paymentIntentId || !stripe) return false;

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    return String(pi.status ?? "").toLowerCase() === "succeeded";
  } catch {
    return false;
  }
}

async function listRecentPayoutLedger(jobId: string) {
  return await db
    .select({
      type: v4FinancialLedger.type,
      amountCents: v4FinancialLedger.amountCents,
      stripeRef: v4FinancialLedger.stripeRef,
      dedupeKey: v4FinancialLedger.dedupeKey,
      createdAt: v4FinancialLedger.createdAt,
    })
    .from(v4FinancialLedger)
    .where(
      and(
        eq(v4FinancialLedger.jobId, jobId),
        inArray(v4FinancialLedger.type, [
          PAYOUT_RELEASE_INITIATED,
          CONTRACTOR_TRANSFER_CREATED,
          ROUTER_TRANSFER_CREATED,
          PLATFORM_REVENUE_RECORDED,
          FUNDS_RELEASED_FINAL,
        ]),
      ),
    )
    .orderBy(desc(v4FinancialLedger.createdAt))
    .limit(50);
}

export async function releaseFundsForJob(input: ReleaseFundsForJobInput): Promise<ReleaseFundsForJobResult> {
  const jobId = String(input.jobId ?? "").trim();
  const actorId = String(input.actorId ?? "").trim();
  if (!jobId) {
    return { ok: false, code: "MISSING_JOB_ID", error: "Missing jobId", jobId: "" };
  }
  if (!actorId) {
    return { ok: false, code: "MISSING_ACTOR", error: "Missing actorId", jobId };
  }

  const alreadyReleased = await existsByDedupeKey(payoutDedupeKeys.fundsReleased(jobId));
  if (alreadyReleased) {
    return { ok: true, jobId, alreadyReleased: true };
  }

  const job = await loadJob(jobId);
  if (!job) {
    return { ok: false, code: "JOB_NOT_FOUND", error: "Job not found", jobId };
  }

  const reasons: string[] = [];
  if (String(job.status ?? "") !== "COMPLETED") reasons.push("JOB_NOT_COMPLETED");
  if (!job.routerApprovedAt) reasons.push("ROUTER_APPROVAL_MISSING");

  const captured = await hasCapturedEvidence(job);
  if (!captured) reasons.push("CAPTURE_EVIDENCE_MISSING");

  if (reasons.length > 0) {
    return {
      ok: false,
      jobId,
      code: "PAYOUT_NOT_ELIGIBLE",
      error: reasons.join(","),
    };
  }

  const baseSplitCents   = computeBaseSplitCents(job);
  const regionalFeeCents = Math.trunc(Number(job.regionalFeeCents ?? 0));
  const isRegional       = regionalFeeCents > 0;
  const splitType        = isRegional ? "regional" : "urban";
  const contractorShareLabel = isRegional ? "85%" : "80%";

  // Rounding order: contractor first → router second → platform absorbs remainder + $20 flat.
  const contractorPayoutCents = Math.floor(baseSplitCents * (isRegional ? 0.85 : 0.80));
  const routerPayoutCents     = Math.floor(baseSplitCents * 0.10);
  const platformRevenueCents  = baseSplitCents - contractorPayoutCents - routerPayoutCents + regionalFeeCents;
  const currency = normalizeCurrency(job.currency);

  await appendLedgerEntry({
    jobId,
    type: PAYOUT_RELEASE_INITIATED,
    amountCents: baseSplitCents,
    currency,
    dedupeKey: payoutDedupeKeys.payoutInit(jobId),
    meta: {
      actorRole: input.actorRole,
      actorId,
      source: "v4_release_funds_service",
      splitType,
      contractorShare: contractorShareLabel,
    },
  });

  const out: ReleaseJobFundsResult = await releaseJobFundsLegacyEngine({
    jobId,
    triggeredByUserId: actorId,
  });

  if (!out.ok) {
    console.error("[V4_RELEASE_FUNDS_ERROR]", {
      jobId,
      code: out.code,
      error: out.error,
    });
    return out;
  }

  const contractorLeg = out.legs.find((leg) => leg.role === "CONTRACTOR");
  const routerLeg = out.legs.find((leg) => leg.role === "ROUTER");

  if (contractorLeg?.status === "SENT" && contractorLeg.stripeTransferId) {
    await appendLedgerEntry({
      jobId,
      type: CONTRACTOR_TRANSFER_CREATED,
      amountCents: contractorPayoutCents,
      currency,
      stripeRef: contractorLeg.stripeTransferId,
      dedupeKey: payoutDedupeKeys.contractorTransfer(jobId),
      meta: {
        actorRole: input.actorRole,
        actorId,
        description: isRegional ? "Contractor payout (85% regional)" : "Contractor payout (80% urban)",
        splitType,
      },
    });
  }

  if (routerLeg?.status === "SENT" && routerLeg.stripeTransferId) {
    await appendLedgerEntry({
      jobId,
      type: ROUTER_TRANSFER_CREATED,
      amountCents: routerPayoutCents,
      currency,
      stripeRef: routerLeg.stripeTransferId,
      dedupeKey: payoutDedupeKeys.routerTransfer(jobId),
      meta: {
        actorRole: input.actorRole,
        actorId,
        description: "Router payout (10%)",
        splitType,
      },
    });
  }

  await appendLedgerEntry({
    jobId,
    type: PLATFORM_REVENUE_RECORDED,
    amountCents: platformRevenueCents,
    currency,
    dedupeKey: payoutDedupeKeys.platformRevenue(jobId),
    meta: {
      baseSplitCents,
      contractorPayoutCents,
      routerPayoutCents,
      regionalFeeCents,
      actorRole: input.actorRole,
      actorId,
      description: isRegional ? "Platform revenue (5% + regional routing fee)" : "Platform revenue (10% urban)",
      splitType,
    },
  });

  const allSent = out.legs.every((leg) => leg.status === "SENT");
  if (allSent) {
    await appendLedgerEntry({
      jobId,
      type: FUNDS_RELEASED_FINAL,
      amountCents: baseSplitCents,
      currency,
      dedupeKey: payoutDedupeKeys.fundsReleased(jobId),
      meta: {
        actorRole: input.actorRole,
        actorId,
        contractorTransferId: contractorLeg?.status === "SENT" ? contractorLeg.stripeTransferId ?? null : null,
        routerTransferId: routerLeg?.status === "SENT" ? routerLeg.stripeTransferId ?? null : null,
      },
    });
  }

  return {
    ...out,
    jobId,
    alreadyReleased: Boolean(out.alreadyReleased),
    legs: out.legs,
  };
}

export async function getPayoutStatusByJobId(jobId: string) {
  const job = await loadJob(jobId);
  if (!job) {
    return {
      found: false,
      eligible: false,
      released: false,
      finalDedupePresent: false,
      contractorTransferId: null,
      routerTransferId: null,
      ledgerSummary: [],
      releasabilityReasons: ["JOB_NOT_FOUND"],
    };
  }

  const reasons: string[] = [];
  if (String(job.status ?? "") !== "COMPLETED") reasons.push("JOB_NOT_COMPLETED");
  if (!job.routerApprovedAt) reasons.push("ROUTER_APPROVAL_MISSING");
  if (!(await hasCapturedEvidence(job))) reasons.push("CAPTURE_EVIDENCE_MISSING");

  const finalDedupePresent = await existsByDedupeKey(payoutDedupeKeys.fundsReleased(jobId));
  const ledgerSummary = await listRecentPayoutLedger(jobId);

  const contractorTransfer = ledgerSummary.find((row) => row.type === CONTRACTOR_TRANSFER_CREATED)?.stripeRef ?? null;
  const routerTransfer = ledgerSummary.find((row) => row.type === ROUTER_TRANSFER_CREATED)?.stripeRef ?? null;

  return {
    found: true,
    eligible: reasons.length === 0,
    released: finalDedupePresent,
    finalDedupePresent,
    contractorTransferId: contractorTransfer,
    routerTransferId: routerTransfer,
    ledgerSummary,
    releasabilityReasons: reasons,
  };
}
