import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";
import { jobAssignments } from "../../../../../../../db/schema/jobAssignment";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { notificationDeliveries } from "../../../../../../../db/schema/notificationDelivery";
import { requireContractorReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { isJobActive } from "../../../../../../../src/utils/jobActive";
import { getApprovedContractorForUserId } from "../../../../../../../src/services/contractorIdentity";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../web/contractor/jobs/:id/complete
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  summary: z.string().trim().min(20).max(5000),
});

export async function POST(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;

    const jobId = getIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

    const summary = body.data.summary.trim();

    const result = await db.transaction(async (tx) => {
      const c = await getApprovedContractorForUserId(tx, u.userId);
      if (c.kind !== "ok") return { kind: "no_contractor" as const };

      const jobRows = await tx
        .select({
          id: jobs.id,
          status: jobs.status,
          archived: jobs.archived,
          paymentStatus: jobs.payment_status,
          payoutStatus: jobs.payout_status,
          completionDeadlineAt: jobs.completion_deadline_at,
          jobPosterUserId: jobs.job_poster_user_id,
          routerUserId: jobs.claimed_by_user_id,
          contractorCompletedAt: jobs.contractor_completed_at,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      const now = new Date();

      if (job.archived) return { kind: "inactive" as const };
      if (!isJobActive(job)) return { kind: "inactive" as const };
      if (String(job.payoutStatus ?? "") === "RELEASED") return { kind: "already_released" as const };
      if (
        job.completionDeadlineAt instanceof Date &&
        job.completionDeadlineAt.getTime() < now.getTime() &&
        !["COMPLETED", "COMPLETED_APPROVED"].includes(String(job.status ?? "").toUpperCase())
      ) {
        await tx
          .update(jobs)
          .set({
            status: "COMPLETION_FLAGGED" as any,
            completion_flagged_at: now,
            completion_flag_reason: "COMPLETION_DEADLINE_EXCEEDED_MANUAL_REVIEW",
            updated_at: now,
          })
          .where(eq(jobs.id, jobId));
        return { kind: "deadline_exceeded" as const };
      }

      const assignRows = await tx
        .select({ contractorId: jobAssignments.contractorId })
        .from(jobAssignments)
        .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.status, "ASSIGNED")))
        .limit(1);
      const assignment = assignRows[0] ?? null;
      if (!assignment) return { kind: "not_assigned" as const };
      if (String(assignment.contractorId) !== String(c.contractor.id)) return { kind: "forbidden" as const };

      if (job.contractorCompletedAt) return { kind: "already_submitted" as const };

      const updatedRows = await tx
        .update(jobs)
        .set({
          status: "CONTRACTOR_COMPLETED" as any,
          contractor_completed_at: now,
          contractor_completion_summary: summary,
        })
        .where(and(eq(jobs.id, jobId), isNull(jobs.contractor_completed_at)))
        .returning({ id: jobs.id });
      if (!updatedRows.length) return { kind: "already_submitted" as const };

      // Mark assignment completed (contractor side)
      await tx
        .update(jobAssignments)
        .set({ status: "COMPLETED", completedAt: now } as any)
        .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.status, "ASSIGNED")));

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "CONTRACTOR_COMPLETED_JOB",
        entityType: "Job",
        entityId: jobId,
        metadata: { summaryLength: summary.length } as any,
      });

      const notifications: Array<{ userId: string; title: string; body: string }> = [];
      if (job.jobPosterUserId) {
        notifications.push({
          userId: String(job.jobPosterUserId),
          title: "Contractor marked job completed",
          body: "Review the completion summary and confirm completion to release funds.",
        });
      }
      if (job.routerUserId) {
        notifications.push({
          userId: String(job.routerUserId),
          title: "Contractor marked job completed",
          body: "Awaiting customer confirmation before you can confirm completion.",
        });
      }

      for (const n of notifications) {
        await tx.insert(notificationDeliveries).values({
          id: randomUUID(),
          userId: n.userId,
          title: n.title,
          body: n.body,
          jobId,
        });
      }

      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (result.kind === "no_contractor") return NextResponse.json({ ok: false, error: "Contractor not found" }, { status: 403 });
    if (result.kind === "not_assigned") return NextResponse.json({ ok: false, error: "Job is not assigned" }, { status: 400 });
    if (result.kind === "inactive") {
      return NextResponse.json({ ok: false, error: "Job is not active. Completion unavailable." }, { status: 400 });
    }
    if (result.kind === "already_released") {
      return NextResponse.json({ ok: false, error: "Job payout already released." }, { status: 400 });
    }
    if (result.kind === "already_submitted") {
      return NextResponse.json({ ok: false, error: "Completion already submitted." }, { status: 400 });
    }
    if (result.kind === "deadline_exceeded") {
      return NextResponse.json({ ok: false, error: "Completion deadline exceeded. Manual review required." }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

