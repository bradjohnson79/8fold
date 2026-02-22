import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { notificationDeliveries } from "../../../../../../../db/schema/notificationDelivery";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../web/job-poster/jobs/:id/confirm-completion
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  summary: z.string().trim().min(20).max(5000),
});

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
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
          customerApprovedAt: jobs.customer_approved_at,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };

      if (String(job.jobPosterUserId ?? "") !== u.userId) return { kind: "forbidden" as const };
      if (job.archived) return { kind: "inactive" as const };
      if (!["FUNDED", "FUNDS_SECURED"].includes(String(job.paymentStatus ?? "").toUpperCase())) return { kind: "inactive" as const };
      if (String(job.payoutStatus ?? "") === "RELEASED") return { kind: "already_released" as const };
      if (String(job.status ?? "") === "DISPUTED") return { kind: "disputed" as const };
      const now = new Date();
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

      if (!job.contractorCompletedAt) return { kind: "awaiting_contractor" as const };
      if (job.customerApprovedAt) return { kind: "already_submitted" as const };

      const updated = await tx
        .update(jobs)
        .set({
          status: "CUSTOMER_APPROVED" as any,
          customer_approved_at: now,
          customer_completion_summary: summary,
        })
        .where(and(eq(jobs.id, jobId), isNull(jobs.customer_approved_at)))
        .returning({ id: jobs.id });
      if (!updated.length) return { kind: "already_submitted" as const };

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "CUSTOMER_CONFIRMED_COMPLETION",
        entityType: "Job",
        entityId: jobId,
        metadata: { summaryLength: summary.length } as any,
      });

      if (job.routerUserId) {
        await tx.insert(notificationDeliveries).values({
          id: randomUUID(),
          userId: String(job.routerUserId),
          title: "Customer confirmed job completion",
          body: "Both contractor and customer have confirmed completion. Please confirm to release funds.",
          jobId,
        });
      }

      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (result.kind === "inactive") {
      return NextResponse.json({ ok: false, error: "Job is not active. Completion unavailable." }, { status: 400 });
    }
    if (result.kind === "already_released") {
      return NextResponse.json({ ok: false, error: "Job payout already released." }, { status: 400 });
    }
    if (result.kind === "awaiting_contractor") {
      return NextResponse.json({ ok: false, error: "Awaiting contractor completion." }, { status: 400 });
    }
    if (result.kind === "already_submitted") {
      return NextResponse.json({ ok: false, error: "Completion already submitted." }, { status: 400 });
    }
    if (result.kind === "disputed") {
      return NextResponse.json({ ok: false, error: "Job is disputed. Completion confirmation is disabled." }, { status: 409 });
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

