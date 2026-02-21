import { randomUUID } from "crypto";
import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { escrows } from "@/db/schema/escrow";
import { ledgerEntries } from "@/db/schema/ledgerEntry";
import { pmRequests } from "@/db/schema/pmRequest";
import { logEvent } from "@/src/server/observability/log";

export type FinalizePmFundingOpts = {
  route: string;
  source: "webhook";
  webhookEventId?: string;
  tx?: any;
};

export type FinalizePmFundingResult =
  | { ok: true; idempotent: boolean; pmRequestId: string; escrowId: string }
  | { ok: false; code: string; reason: string };

function requirePmEscrowMetadata(metadata: Stripe.MetadataParam | null | undefined): {
  pmRequestId: string;
  jobId: string;
  jobPosterUserId: string;
} | null {
  const type = String(metadata?.type ?? "");
  const pmRequestId = String(metadata?.pmRequestId ?? "");
  const jobId = String(metadata?.jobId ?? "");
  const jobPosterUserId = String(metadata?.jobPosterUserId ?? metadata?.posterId ?? "");
  if (type !== "pm_escrow" || !pmRequestId || !jobId || !jobPosterUserId) return null;
  return { pmRequestId, jobId, jobPosterUserId };
}

export async function finalizePmFundingFromPaymentIntent(
  pi: Stripe.PaymentIntent,
  opts: FinalizePmFundingOpts
): Promise<FinalizePmFundingResult> {
  const meta = requirePmEscrowMetadata(pi.metadata);
  if (!meta) {
    return { ok: false, code: "INVALID_METADATA", reason: "missing pm_escrow metadata" };
  }

  const run = async (tx: any): Promise<FinalizePmFundingResult> => {
    const pmRows = await tx
      .select({
        id: pmRequests.id,
        status: pmRequests.status,
        jobId: pmRequests.jobId,
        jobPosterUserId: pmRequests.jobPosterUserId,
        approvedTotal: pmRequests.approvedTotal,
        currency: pmRequests.currency,
        stripePaymentIntentId: pmRequests.stripePaymentIntentId,
        escrowId: pmRequests.escrowId,
      })
      .from(pmRequests)
      .where(
        and(
          eq(pmRequests.id, meta.pmRequestId),
          eq(pmRequests.jobId, meta.jobId),
          eq(pmRequests.jobPosterUserId, meta.jobPosterUserId)
        )
      )
      .limit(1);
    const pm = pmRows[0] ?? null;
    if (!pm) return { ok: false, code: "PM_NOT_FOUND", reason: "pm request not found" };
    if (String(pm.jobId ?? "") !== meta.jobId) return { ok: false, code: "JOB_MISMATCH", reason: "job mismatch" };

    if (pm.escrowId && String(pm.status ?? "") === "FUNDED") {
      return {
        ok: true,
        idempotent: true,
        pmRequestId: pm.id,
        escrowId: pm.escrowId,
      };
    }

    const amountCents = Math.round(Number(pm.approvedTotal ?? 0) * 100);
    const currency = String(pm.currency ?? "USD").toUpperCase();
    const incomingAmount = Number(pi.amount_received ?? pi.amount ?? 0);
    if (incomingAmount !== amountCents) {
      return { ok: false, code: "AMOUNT_MISMATCH", reason: "payment amount mismatch" };
    }
    if (pi.status !== "succeeded") {
      return { ok: false, code: "PI_NOT_SUCCEEDED", reason: "payment intent not succeeded" };
    }

    const now = new Date();
    let escrowId: string | null = await tx
      .select({ id: escrows.id })
      .from(escrows)
      .where(eq(escrows.stripePaymentIntentId, pi.id))
      .limit(1)
      .then((r: Array<{ id: string }>) => r[0]?.id ?? null);

    if (!escrowId) {
      try {
        escrowId = randomUUID();
        await tx.insert(escrows).values({
          id: escrowId,
          jobId: meta.jobId,
          kind: "PARTS_MATERIALS" as any,
          amountCents,
          currency: currency as any,
          status: "FUNDED" as any,
          stripePaymentIntentId: pi.id,
          webhookProcessedAt: now,
          updatedAt: now,
        } as any);
      } catch {
        // Concurrent insert on unique stripePaymentIntentId; resolve idempotently.
        escrowId = await tx
          .select({ id: escrows.id })
          .from(escrows)
          .where(eq(escrows.stripePaymentIntentId, pi.id))
          .limit(1)
          .then((r: Array<{ id: string }>) => r[0]?.id ?? null);
      }
    }
    if (!escrowId) return { ok: false, code: "ESCROW_CREATE_FAILED", reason: "unable to create escrow" };

    await tx
      .update(pmRequests)
      .set({
        escrowId,
        status: "FUNDED",
        updatedAt: now,
      })
      .where(and(eq(pmRequests.id, meta.pmRequestId), isNull(pmRequests.escrowId)));

    // Ensure mapping exists even if escrow was already linked.
    await tx
      .update(pmRequests)
      .set({
        escrowId,
        status: "FUNDED",
        updatedAt: now,
      })
      .where(eq(pmRequests.id, meta.pmRequestId));

    const existingFundLedger = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.escrowId, escrowId),
          eq(ledgerEntries.type, "PM_ESCROW_FUNDED" as any),
        ),
      )
      .limit(1)
      .then((r: Array<{ id: string }>) => r[0] ?? null);
    if (!existingFundLedger) {
      await tx.insert(ledgerEntries).values({
        id: randomUUID(),
        userId: meta.jobPosterUserId,
        jobId: meta.jobId,
        escrowId,
        type: "PM_ESCROW_FUNDED" as any,
        direction: "DEBIT" as any,
        bucket: "HELD" as any,
        amountCents,
        currency: currency as any,
        stripeRef: pi.id,
        memo: `P&M escrow funded for request ${meta.pmRequestId}`,
      } as any);
    }

    logEvent({
      level: "info",
      event: "pm.escrow_funded",
      route: opts.route,
      method: "POST",
      context: {
        pmRequestId: meta.pmRequestId,
        escrowId,
        amountCents,
        webhookEventId: opts.webhookEventId,
      },
    });

    return {
      ok: true,
      idempotent: false,
      pmRequestId: meta.pmRequestId,
      escrowId,
    };
  };

  return opts.tx ? run(opts.tx) : db.transaction(run);
}

export { requirePmEscrowMetadata };
