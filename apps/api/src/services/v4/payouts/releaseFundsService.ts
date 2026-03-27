import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { jobHolds } from "@/db/schema/jobHold";
import { v4FinancialLedger } from "@/db/schema/v4FinancialLedger";
import { existsByDedupeKey, appendLedgerEntry } from "@/src/services/v4/financialLedgerService";
import {
  CONTRACTOR_TRANSFER_CREATED,
  FUNDS_RELEASED_FINAL,
  PAYOUT_RELEASE_INITIATED,
  PLATFORM_REVENUE_RECORDED,
  ROUTER_COMMISSION_EARNED,
  ROUTER_COMMISSION_PLATFORM_RETAINED,
  ROUTER_TRANSFER_CREATED,
  payoutDedupeKeys,
} from "@/src/services/v4/payouts/payoutLedgerTypes";
import {
  releaseJobFundsLegacyEngine,
  type ReleaseJobFundsResult,
} from "@/src/payouts/releaseJobFundsLegacyEngine";
import { stripe } from "@/src/stripe/stripe";
import { getPlatformFees } from "@/src/config/platformFees";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { isStoredJobPaymentPaid } from "@/src/payments/paymentState";

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
    status: "SENT" | "FAILED" | "PENDING" | "RETAINED";
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
  completionWindowExpiresAt: Date | null;
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
      completionWindowExpiresAt: jobs.completion_window_expires_at,
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

async function hasActiveDisputeHold(jobId: string): Promise<boolean> {
  const rows = await db
    .select({ id: jobHolds.id })
    .from(jobHolds)
    .where(and(eq(jobHolds.jobId, jobId), eq(jobHolds.reason, "DISPUTE" as any), eq(jobHolds.status, "ACTIVE" as any)))
    .limit(1);
  return Boolean(rows[0]?.id);
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

  if (isStoredJobPaymentPaid(job.paymentStatus)) return true;

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
          ROUTER_COMMISSION_EARNED,
          ROUTER_COMMISSION_PLATFORM_RETAINED,
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
  if (job.completionWindowExpiresAt instanceof Date && job.completionWindowExpiresAt.getTime() > Date.now()) {
    reasons.push("REVIEW_WINDOW_ACTIVE");
  }
  if (await hasActiveDisputeHold(jobId)) reasons.push("DISPUTE_HOLD_ACTIVE");

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
  const routerShareLabel = "8%";
  const platformShareLabel = isRegional ? "7% + regional routing fee" : "12% urban";
  const fees = getPlatformFees(isRegional);

  // Rounding order: contractor first → router second → platform absorbs remainder + $20 flat.
  const contractorPayoutCents = Math.floor(baseSplitCents * fees.contractor);
  const routerPayoutCents     = Math.floor(baseSplitCents * fees.router);
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
        description: `Router payout (${routerShareLabel})`,
        splitType,
      },
    });
  }
  if (routerLeg?.status === "PENDING") {
    await appendLedgerEntry({
      jobId,
      type: ROUTER_COMMISSION_EARNED,
      amountCents: routerPayoutCents,
      currency,
      dedupeKey: payoutDedupeKeys.routerCommissionEarned(jobId),
      meta: {
        actorRole: input.actorRole,
        actorId,
        description: `Router commission earned (${routerShareLabel})`,
        splitType,
        payoutTiming: "friday_batch",
      },
    });
  }
  if (routerLeg?.status === "RETAINED") {
    await appendLedgerEntry({
      jobId,
      type: ROUTER_COMMISSION_PLATFORM_RETAINED,
      amountCents: routerPayoutCents,
      currency,
      dedupeKey: payoutDedupeKeys.routerCommissionRetained(jobId),
      meta: {
        actorRole: input.actorRole,
        actorId,
        description: `Router commission retained by platform (${routerShareLabel})`,
        splitType,
        retentionReason: "admin_router",
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
      description: `Platform revenue (${platformShareLabel})`,
      splitType,
    },
  });

  const releaseComplete =
    contractorLeg?.status === "SENT" &&
    out.legs.some((leg) => leg.role === "PLATFORM" && leg.status === "SENT") &&
    Boolean(routerLeg && ["PENDING", "RETAINED", "SENT"].includes(routerLeg.status));
  if (releaseComplete) {
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
        routerCommissionStatus: routerLeg?.status ?? null,
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
  if (job.completionWindowExpiresAt instanceof Date && job.completionWindowExpiresAt.getTime() > Date.now()) {
    reasons.push("REVIEW_WINDOW_ACTIVE");
  }
  if (await hasActiveDisputeHold(jobId)) reasons.push("DISPUTE_HOLD_ACTIVE");
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

export async function runDelayedPayoutReleaseCycle(now = new Date()): Promise<{
  scanned: number;
  released: number;
  alreadyReleased: number;
  failed: Array<{ jobId: string; code: string; error: string }>;
}> {
  const candidates = await db
    .select({
      id: jobs.id,
      payoutStatus: jobs.payout_status,
      contractorUserId: jobs.contractor_user_id,
      jobPosterUserId: jobs.job_poster_user_id,
      routerUserId: jobs.claimed_by_user_id,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "COMPLETED" as any),
        inArray(jobs.payment_status, ["FUNDED", "FUNDS_SECURED"] as any),
        inArray(jobs.payout_status, ["NOT_READY", "READY", "FAILED"] as any),
        isNull(jobs.released_at),
        eq(jobs.archived, false),
        sql`${jobs.completion_window_expires_at} is not null`,
        sql`${jobs.completion_window_expires_at} <= ${now}`,
        sql`not exists (
          select 1
          from "JobHold" h
          where h."jobId" = ${jobs.id}
            and h."reason" = 'DISPUTE'
            and h."status" = 'ACTIVE'
        )`,
      ),
    );

  let released = 0;
  let alreadyReleased = 0;
  const failed: Array<{ jobId: string; code: string; error: string }> = [];

  for (const candidate of candidates) {
    if (String(candidate.payoutStatus ?? "").toUpperCase() !== "READY") {
      await db
        .update(jobs)
        .set({ payout_status: "READY" as any, updated_at: now } as any)
        .where(eq(jobs.id, candidate.id));
    }

    await emitDomainEvent({
      type: "FUNDS_RELEASE_ELIGIBLE",
      payload: {
        jobId: candidate.id,
        contractorId: candidate.contractorUserId ? String(candidate.contractorUserId) : null,
        jobPosterId: candidate.jobPosterUserId ? String(candidate.jobPosterUserId) : null,
        routerId: candidate.routerUserId ? String(candidate.routerUserId) : null,
        createdAt: now,
        dedupeKeyBase: `funds_release_eligible:${candidate.id}`,
      },
    }).catch(() => undefined);

    const out = await releaseFundsForJob({
      jobId: candidate.id,
      actorRole: "SYSTEM",
      actorId: "system:delayed-payout-scheduler",
    });

    if (out.ok && out.alreadyReleased) {
      alreadyReleased += 1;
      continue;
    }
    if (out.ok) {
      released += 1;
      continue;
    }

    console.error("[DELAYED_PAYOUT_RELEASE_FAILED]", {
      jobId: candidate.id,
      code: out.code,
      error: out.error,
    });
    failed.push({
      jobId: candidate.id,
      code: String(out.code ?? "RELEASE_FAILED"),
      error: String(out.error ?? "Release failed"),
    });
  }

  return {
    scanned: candidates.length,
    released,
    alreadyReleased,
    failed,
  };
}
