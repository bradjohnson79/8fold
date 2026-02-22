import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { disputeCases } from "@/db/schema/disputeCase";
import { disputeVotes } from "@/db/schema/disputeVote";
import { jobs } from "@/db/schema/job";
import { supportAttachments } from "@/db/schema/supportAttachment";
import { requestAiDisputeAdvisory } from "@/src/support/aiDisputeAdvisory";
import { sanitizeText } from "@/src/utils/sanitizeText";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

/**
 * Admin-only: request AI advisory vote.
 *
 * Returns: { ok: true, data: { decision, confidence, reasoning } }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const disputeId = getIdFromUrl(req);

    const disputeRows = await db
      .select({
        id: disputeCases.id,
        jobId: disputeCases.jobId,
        ticketId: disputeCases.ticketId,
        disputeReason: disputeCases.disputeReason,
        againstRole: disputeCases.againstRole,
        description: disputeCases.description,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
      })
      .from(disputeCases)
      .where(eq(disputeCases.id, disputeId))
      .limit(1);
    const dispute = disputeRows[0] ?? null;
    if (!dispute) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const jobRows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        paymentStatus: jobs.payment_status,
        payoutStatus: jobs.payout_status,
        amountCents: jobs.amount_cents,
        paymentCurrency: jobs.payment_currency,
        contractorCompletionSummary: jobs.contractor_completion_summary,
        customerCompletionSummary: jobs.customer_completion_summary,
      })
      .from(jobs)
      .where(eq(jobs.id, dispute.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;

    const evidenceRows = await db
      .select({ id: supportAttachments.id })
      .from(supportAttachments)
      .where(eq(supportAttachments.ticketId, dispute.ticketId))
      .limit(1000);
    const evidenceCount = evidenceRows.length;

    const advisory = await requestAiDisputeAdvisory({
      dispute: {
        disputeReason: String(dispute.disputeReason ?? ""),
        description: sanitizeText(String(dispute.description ?? ""), { maxLen: 2000 }),
        filedByRole: "UNKNOWN",
        againstRole: String(dispute.againstRole ?? "") === "JOB_POSTER" ? "POSTER" : "CONTRACTOR",
      },
      job: job
        ? {
            title: String(job.title ?? ""),
            status: String(job.status ?? ""),
            paymentStatus: job.paymentStatus ? String(job.paymentStatus) : null,
            payoutStatus: job.payoutStatus ? String(job.payoutStatus) : null,
            amountCents: job.amountCents == null ? null : Number(job.amountCents),
            currency: job.paymentCurrency ? String(job.paymentCurrency) : null,
            contractorCompletionSummary:
              (job as any).contractorCompletionSummary
                ? sanitizeText(String((job as any).contractorCompletionSummary), { maxLen: 1200, trim: true })
                : null,
            customerCompletionSummary:
              (job as any).customerCompletionSummary
                ? sanitizeText(String((job as any).customerCompletionSummary), { maxLen: 1200, trim: true })
                : null,
          }
        : null,
      evidenceCount,
    });

    const out = {
      decision: advisory.decision,
      confidence: advisory.confidencePct,
      reasoning: sanitizeText(advisory.reasoning, { maxLen: 4000 }),
    };

    await db.transaction(async (tx) => {
      await tx
        .update(disputeVotes)
        .set({ status: "SUPERSEDED" } as any)
        .where(and(eq(disputeVotes.disputeCaseId, disputeId), eq(disputeVotes.voterType, "AI_ADVISORY"), eq(disputeVotes.status, "ACTIVE")));

      await tx.insert(disputeVotes).values({
        id: crypto.randomUUID(),
        disputeCaseId: disputeId,
        voterType: "AI_ADVISORY",
        voterUserId: null,
        status: "ACTIVE",
        vote: out.decision,
        rationale: out.reasoning,
        model: advisory.model,
        confidence: out.confidence,
        payload: { decision: out.decision, confidence: out.confidence, model: advisory.model } as any,
      } as any);

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "DISPUTE_AI_ADVISORY_REQUESTED",
        entityType: "DisputeCase",
        entityId: disputeId,
        metadata: {
          model: advisory.model,
          confidence: out.confidence,
          sanitized: true,
          superseded: true,
        } as any,
      });
    });

    return NextResponse.json({ ok: true, data: out });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/disputes/[id]/ai-advisory", {
      route: "/api/admin/disputes/[id]/ai-advisory",
      userId: auth.userId,
    });
  }
}
