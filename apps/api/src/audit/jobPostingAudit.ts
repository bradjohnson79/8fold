import { randomUUID } from "crypto";
import { PayoutBreakdown } from "@8fold/shared";
import { db } from "../../db/drizzle";
import { auditLogs } from "../../db/schema";

export async function logJobDraftCreated(
  draftId: string,
  userId: string,
  metadata: {
    title: string;
    tradeCategory: string;
    region: string;
    laborTotalCents: number;
  }
) {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    actorUserId: userId,
    action: "JOB_DRAFT_CREATED",
    entityType: "JobDraft",
    entityId: draftId,
    metadata: {
      title: metadata.title,
      tradeCategory: metadata.tradeCategory,
      region: metadata.region,
      laborTotalCents: metadata.laborTotalCents,
    } as any,
  });
}

export async function logPriceAppraisal(
  draftId: string,
  userId: string,
  metadata: {
    priceMedianCents: number;
    allowedDeltaCents: number;
    reasoning: string;
  }
) {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    actorUserId: userId,
    action: "PRICE_APPRAISAL_COMPLETED",
    entityType: "JobDraft",
    entityId: draftId,
    metadata: {
      priceMedianCents: metadata.priceMedianCents,
      allowedDeltaCents: metadata.allowedDeltaCents,
      reasoning: metadata.reasoning,
    } as any,
  });
}

export async function logPaymentIntentCreated(
  draftId: string,
  userId: string,
  metadata: {
    paymentIntentId: string;
    selectedPriceCents: number;
    priceAdjustmentCents: number;
    totalCents: number;
  }
) {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    actorUserId: userId,
    action: "PAYMENT_INTENT_CREATED",
    entityType: "JobDraft",
    entityId: draftId,
    metadata: {
      stripePaymentIntentId: metadata.paymentIntentId,
      selectedPriceCents: metadata.selectedPriceCents,
      priceAdjustmentCents: metadata.priceAdjustmentCents,
      totalCents: metadata.totalCents,
    } as any,
  });
}

export async function logJobPaymentIntentCreated(
  jobId: string,
  userId: string,
  metadata: {
    paymentIntentId: string;
    selectedPriceCents: number;
    priceAdjustmentCents: number;
    totalCents: number;
  }
) {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    actorUserId: userId,
    action: "PAYMENT_INTENT_CREATED",
    entityType: "Job",
    entityId: jobId,
    metadata: {
      stripePaymentIntentId: metadata.paymentIntentId,
      selectedPriceCents: metadata.selectedPriceCents,
      priceAdjustmentCents: metadata.priceAdjustmentCents,
      totalCents: metadata.totalCents,
    } as any,
  });
}

export async function logPaymentCompleted(
  jobId: string,
  userId: string,
  metadata: {
    paymentIntentId: string;
    amountCents: number;
    breakdown: PayoutBreakdown;
  }
) {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    actorUserId: userId,
    action: "PAYMENT_COMPLETED",
    entityType: "Job",
    entityId: jobId,
    metadata: {
      stripePaymentIntentId: metadata.paymentIntentId,
      amountCents: metadata.amountCents,
      breakdown: metadata.breakdown,
    } as any,
  });
}

export async function logJobCreated(
  jobId: string,
  userId: string,
  metadata: {
    draftId: string;
    title: string;
    pricingVersion: string;
    breakdown: PayoutBreakdown;
  }
) {
  await db.insert(auditLogs).values({
    id: randomUUID(),
    actorUserId: userId,
    action: "JOB_CREATED_VIA_POSTING",
    entityType: "Job",
    entityId: jobId,
    metadata: {
      draftId: metadata.draftId,
      title: metadata.title,
      pricingVersion: metadata.pricingVersion,
      breakdown: metadata.breakdown,
    } as any,
  });
}
