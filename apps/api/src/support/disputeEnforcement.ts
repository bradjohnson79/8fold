import crypto from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { auditLogs } from "../../db/schema/auditLog";
import { disputeCases } from "../../db/schema/disputeCase";
import { disputeEnforcementActions } from "../../db/schema/disputeEnforcementAction";
import { internalAccountFlags } from "../../db/schema/internalAccountFlag";
import { jobHolds } from "../../db/schema/jobHold";
import { jobPayments } from "../../db/schema/jobPayment";
import { jobs } from "../../db/schema/job";

/**
 * Financial safety contract:
 * - Enforcement actions here do NOT charge/refund/release funds and do NOT write ledger entries.
 * - "Release escrow" actions in this module only set DB flags (e.g. `paymentReleasedAt`) and release holds.
 * - Actual payout/ledger/transfer mutations happen in the separate payout engine, which can still refuse
 *   to move money (e.g. if the job remains disputed).
 */
export type EnforcementPayload =
  | { kind: "none" }
  | { kind: "withhold"; notes?: string }
  | { kind: "partial_release"; withholdAmountCents: number; currency: "USD" | "CAD"; notes?: string }
  | { kind: "flag_account"; userId: string; flagType: "DISPUTE_RISK" | "FRAUD_REVIEW" | "MANUAL_REVIEW"; reason: string };

export function payloadForAction(action: {
  type: string;
  payload: unknown | null;
}): EnforcementPayload {
  if (!action.payload || typeof action.payload !== "object") return { kind: "none" };
  const p = action.payload as any;
  if (action.type === "WITHHOLD_FUNDS") {
    return { kind: "withhold", notes: typeof p.notes === "string" ? p.notes : undefined };
  }
  if (action.type === "RELEASE_ESCROW_PARTIAL") {
    return {
      kind: "partial_release",
      withholdAmountCents: Number(p.withholdAmountCents ?? 0),
      currency: p.currency === "CAD" ? "CAD" : "USD",
      notes: typeof p.notes === "string" ? p.notes : undefined,
    };
  }
  if (action.type === "FLAG_ACCOUNT_INTERNAL") {
    return {
      kind: "flag_account",
      userId: String(p.userId ?? ""),
      flagType: (p.flagType as any) ?? "DISPUTE_RISK",
      reason: String(p.reason ?? ""),
    };
  }
  return { kind: "none" };
}

export async function executePendingDisputeEnforcementActions(opts: {
  disputeCaseId: string;
  actorUserId: string;
}): Promise<{
  executed: number;
  failed: number;
  cancelled: number;
  actions: Array<{ id: string; type: string; status: string; error?: string | null }>;
}> {
  const now = new Date();

  return await db.transaction(async (tx) => {
    const disputeRows = await tx
      .select({
        id: disputeCases.id,
        jobId: disputeCases.jobId,
        ticketId: disputeCases.ticketId,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
      })
      .from(disputeCases)
      .where(eq(disputeCases.id, opts.disputeCaseId))
      .limit(1);
    const dispute = disputeRows[0] ?? null;
    if (!dispute) throw Object.assign(new Error("Not found"), { status: 404 });

    const actions = await tx
      .select({
        id: disputeEnforcementActions.id,
        type: disputeEnforcementActions.type,
        payload: disputeEnforcementActions.payload,
      })
      .from(disputeEnforcementActions)
      .where(and(eq(disputeEnforcementActions.disputeCaseId, dispute.id), eq(disputeEnforcementActions.status, "PENDING")))
      .orderBy(asc(disputeEnforcementActions.createdAt), asc(disputeEnforcementActions.id))
      .limit(25);

    let executed = 0;
    let failed = 0;
    let cancelled = 0;

    const results: Array<{ id: string; type: string; status: string; error?: string | null }> = [];

    for (const a of actions) {
      try {
        // RELEASING ESCROW: represents "ok to release funds" in our system by setting paymentReleasedAt.
        // WITHHOLD / PARTIAL: represented by JobHold rows for auditability + future payout blocking.
        // FLAG: creates InternalAccountFlag rows (append-only; resolvable later).
        if (a.type === "RELEASE_ESCROW_FULL") {
          await tx.update(jobs).set({ payment_released_at: now }).where(eq(jobs.id, dispute.jobId));
          await tx
            .update(jobPayments)
            .set({ paymentReleasedAt: now, updatedAt: now } as any)
            .where(and(eq(jobPayments.jobId, dispute.jobId), isNull(jobPayments.paymentReleasedAt)));

          // Release any dispute holds tied to this dispute.
          await tx
            .update(jobHolds)
            .set({ status: "RELEASED", releasedAt: now, releasedByUserId: opts.actorUserId } as any)
            .where(
              and(
                eq(jobHolds.jobId, dispute.jobId),
                eq(jobHolds.status, "ACTIVE"),
                eq(jobHolds.reason, "DISPUTE"),
                eq(jobHolds.sourceDisputeCaseId, dispute.id),
              ),
            );
        } else if (a.type === "WITHHOLD_FUNDS") {
          const p = payloadForAction(a);
          const notes = p.kind === "withhold" ? p.notes : undefined;
          // Idempotency: one active DISPUTE hold per dispute case.
          const existing = await tx
            .select({ id: jobHolds.id })
            .from(jobHolds)
            .where(
              and(
                eq(jobHolds.jobId, dispute.jobId),
                eq(jobHolds.status, "ACTIVE"),
                eq(jobHolds.reason, "DISPUTE"),
                eq(jobHolds.sourceDisputeCaseId, dispute.id),
              ),
            )
            .limit(1);
          if (!existing) {
            await tx.insert(jobHolds).values({
              id: crypto.randomUUID(),
              jobId: dispute.jobId,
              reason: "DISPUTE",
              status: "ACTIVE",
              notes: notes ? `Dispute enforcement: ${notes}` : "Dispute enforcement: withhold funds",
              appliedByUserId: opts.actorUserId,
              sourceDisputeCaseId: dispute.id,
            } as any);
          }
        } else if (a.type === "RELEASE_ESCROW_PARTIAL") {
          const p = payloadForAction(a);
          if (p.kind !== "partial_release" || !Number.isInteger(p.withholdAmountCents) || p.withholdAmountCents <= 0) {
            throw new Error("Invalid payload for partial release");
          }

          await tx.update(jobs).set({ payment_released_at: now }).where(eq(jobs.id, dispute.jobId));
          await tx
            .update(jobPayments)
            .set({ paymentReleasedAt: now, updatedAt: now } as any)
            .where(and(eq(jobPayments.jobId, dispute.jobId), isNull(jobPayments.paymentReleasedAt)));

          const existing = await tx
            .select({ id: jobHolds.id })
            .from(jobHolds)
            .where(
              and(
                eq(jobHolds.jobId, dispute.jobId),
                eq(jobHolds.status, "ACTIVE"),
                eq(jobHolds.reason, "DISPUTE"),
                eq(jobHolds.sourceDisputeCaseId, dispute.id),
              ),
            )
            .limit(1);
          const notes = p.notes
            ? `Dispute enforcement (partial): ${p.notes}`
            : "Dispute enforcement: partial release (withhold remaining)";
          if (existing[0]?.id) {
            await tx
              .update(jobHolds)
              .set({ amountCents: p.withholdAmountCents, currency: p.currency as any, notes } as any)
              .where(eq(jobHolds.id, existing[0].id));
          } else {
            await tx.insert(jobHolds).values({
              id: crypto.randomUUID(),
              jobId: dispute.jobId,
              reason: "DISPUTE",
              status: "ACTIVE",
              amountCents: p.withholdAmountCents,
              currency: p.currency as any,
              notes,
              appliedByUserId: opts.actorUserId,
              sourceDisputeCaseId: dispute.id,
            } as any);
          }
        } else if (a.type === "FLAG_ACCOUNT_INTERNAL") {
          const p = payloadForAction(a);
          if (p.kind !== "flag_account" || !p.userId || !p.reason) throw new Error("Invalid payload for flag");

          // Limit flags to dispute participants for fairness/auditability.
          if (![dispute.filedByUserId, dispute.againstUserId].includes(p.userId)) {
            throw new Error("Flag target must be a dispute participant");
          }

          await tx
            .insert(internalAccountFlags)
            .values({
              id: crypto.randomUUID(),
              userId: p.userId,
              type: p.flagType as any,
              status: "ACTIVE",
              reason: p.reason,
              disputeCaseId: dispute.id,
              createdByUserId: opts.actorUserId,
              updatedAt: now,
            } as any)
            .onConflictDoUpdate({
              target: [internalAccountFlags.userId, internalAccountFlags.type, internalAccountFlags.disputeCaseId],
              set: { reason: p.reason, status: "ACTIVE", updatedAt: now } as any,
            });
        } else {
          // Unknown / future type: cancel (non-destructive) so it doesn't block the queue forever.
          await tx
            .update(disputeEnforcementActions)
            .set({
              status: "CANCELLED",
              executedAt: now,
              executedByUserId: opts.actorUserId,
              error: "Unknown action type",
              updatedAt: now,
            } as any)
            .where(eq(disputeEnforcementActions.id, a.id));
          await tx.insert(auditLogs).values({
            id: crypto.randomUUID(),
            actorUserId: opts.actorUserId,
            action: "DISPUTE_ENFORCEMENT_ACTION_CANCELLED",
            entityType: "DisputeEnforcementAction",
            entityId: a.id,
            metadata: { disputeCaseId: dispute.id, type: a.type } as any,
          });
          cancelled += 1;
          results.push({ id: a.id, type: a.type, status: "CANCELLED", error: "Unknown action type" });
          continue;
        }

        await tx
          .update(disputeEnforcementActions)
          .set({ status: "EXECUTED", executedAt: now, executedByUserId: opts.actorUserId, error: null, updatedAt: now } as any)
          .where(eq(disputeEnforcementActions.id, a.id));
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorUserId: opts.actorUserId,
          action: "DISPUTE_ENFORCEMENT_ACTION_EXECUTED",
          entityType: "DisputeEnforcementAction",
          entityId: a.id,
          metadata: { disputeCaseId: dispute.id, type: a.type } as any,
        });

        executed += 1;
        results.push({ id: a.id, type: a.type, status: "EXECUTED" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Execution failed";
        await tx
          .update(disputeEnforcementActions)
          .set({ status: "FAILED", executedAt: now, executedByUserId: opts.actorUserId, error: msg, updatedAt: now } as any)
          .where(eq(disputeEnforcementActions.id, a.id));
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorUserId: opts.actorUserId,
          action: "DISPUTE_ENFORCEMENT_ACTION_FAILED",
          entityType: "DisputeEnforcementAction",
          entityId: a.id,
          metadata: { disputeCaseId: dispute.id, type: a.type, error: msg } as any,
        });
        failed += 1;
        results.push({ id: a.id, type: a.type, status: "FAILED", error: msg });
      }
    }

    return { executed, failed, cancelled, actions: results };
  });
}

