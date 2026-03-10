import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests } from "@/db/schema";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { v4SupportMessages } from "@/db/schema/v4SupportMessage";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const BodySchema = z.object({
  reason: z.string().trim().min(1).max(5000),
});

const ELIGIBLE_STATUSES = ["ASSIGNED", "JOB_STARTED", "IN_PROGRESS"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    const completionGuard = await requireRoleCompletion(role.userId, "JOB_POSTER");
    if (completionGuard) return completionGuard;

    const { id: jobId } = await params;
    if (!jobId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "V4_CANCEL_ASSIGNED_INVALID", message: "Reason is required" } },
        { status: 400 },
      );
    }
    const { reason } = parsed.data;

    // Load job
    const jobRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        jobPosterUserId: jobs.job_poster_user_id,
        appointmentAt: jobs.appointment_at,
        cancelRequestPending: jobs.cancel_request_pending,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    const job = jobRows[0] ?? null;
    if (!job || String(job.jobPosterUserId ?? "") !== role.userId) {
      return NextResponse.json(
        { ok: false, error: { code: "V4_JOB_NOT_FOUND", message: "Job not found" } },
        { status: 404 },
      );
    }

    if (!(ELIGIBLE_STATUSES as readonly string[]).includes(String(job.status ?? ""))) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "V4_CANCEL_ASSIGNED_INVALID_STATUS",
            message: `Job must be in ASSIGNED, JOB_STARTED, or IN_PROGRESS status to cancel. Current: ${job.status}`,
          },
        },
        { status: 409 },
      );
    }

    if (job.cancelRequestPending) {
      return NextResponse.json(
        { ok: false, error: { code: "V4_CANCEL_ASSIGNED_ALREADY_PENDING", message: "A cancellation request is already pending" } },
        { status: 409 },
      );
    }

    // 8-hour penalty window: null appointment_at → outside window by policy
    const withinPenaltyWindow =
      job.appointmentAt instanceof Date &&
      job.appointmentAt.getTime() - Date.now() <= 8 * 3600_000;

    const now = new Date();
    const cancelRequestId = crypto.randomUUID();
    const ticketId = crypto.randomUUID();

    const ticketBody = [
      `Job Poster has requested to cancel assigned job ${jobId}.`,
      `Reason: ${reason}`,
      `Status at request: ${job.status}`,
      `Within 8-hour penalty window: ${withinPenaltyWindow}`,
      `Appointment at: ${job.appointmentAt instanceof Date ? job.appointmentAt.toISOString() : "N/A"}`,
      `Requested at: ${now.toISOString()}`,
      `Cancel request ID: ${cancelRequestId}`,
    ].join("\n");

    await db.transaction(async (tx) => {
      // Insert cancel request
      await tx.insert(jobCancelRequests).values({
        id: cancelRequestId,
        jobId,
        jobPosterId: role.userId,
        reason,
        requestedByRole: "JOB_POSTER",
        withinPenaltyWindow,
        supportTicketId: ticketId,
        createdAt: now,
      });

      // Update job status to ASSIGNED_CANCEL_PENDING
      await tx
        .update(jobs)
        .set({
          status: "ASSIGNED_CANCEL_PENDING" as any,
          cancel_request_pending: true,
          updated_at: now,
        })
        .where(eq(jobs.id, jobId));

      // Create support ticket
      await tx.insert(v4SupportTickets).values({
        id: ticketId,
        userId: role.userId,
        role: "JOB_POSTER",
        subject: "Assigned Job Cancellation Request",
        category: "PAYMENT_ISSUE",
        ticketType: "JOB_CANCELLATION",
        priority: "HIGH",
        jobId,
        body: ticketBody,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });

      // Create initial support message
      await tx.insert(v4SupportMessages).values({
        id: crypto.randomUUID(),
        ticketId,
        senderUserId: role.userId,
        senderRole: "JOB_POSTER",
        message: ticketBody,
        createdAt: now,
      });

      // Notify admins via outbox
      await tx.insert(v4EventOutbox).values({
        id: crypto.randomUUID(),
        eventType: "NEW_SUPPORT_TICKET",
        payload: {
          ticketId,
          userId: role.userId,
          role: "JOB_POSTER",
          subject: "Assigned Job Cancellation Request",
          dedupeKey: `support_ticket_created_${ticketId}`,
        },
        createdAt: now,
      });
    });

    // Emit domain event for notifications
    await emitDomainEvent(
      {
        type: "JOB_CANCELLATION_REQUESTED",
        payload: {
          jobId,
          jobPosterId: role.userId,
          cancelRequestId,
          reason,
          createdAt: now,
          dedupeKey: `job_cancel_requested_${cancelRequestId}`,
        },
      },
      { mode: "best_effort" },
    );

    return NextResponse.json({ ok: true, cancelRequestId, ticketId });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_CANCEL_ASSIGNED_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
