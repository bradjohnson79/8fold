import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";
import { asc, eq, or } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { disputeCases } from "../../../../../../db/schema/disputeCase";
import { jobs } from "../../../../../../db/schema/job";
import { supportMessages } from "../../../../../../db/schema/supportMessage";
import { supportTickets } from "../../../../../../db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const disputeId = getIdFromUrl(req);

    const rows = await db
      .select({
        id: disputeCases.id,
        createdAt: disputeCases.createdAt,
        updatedAt: disputeCases.updatedAt,
        ticketId: disputeCases.ticketId,
        jobId: disputeCases.jobId,
        filedByUserId: disputeCases.filedByUserId,
        againstUserId: disputeCases.againstUserId,
        againstRole: disputeCases.againstRole,
        disputeReason: disputeCases.disputeReason,
        description: disputeCases.description,
        status: disputeCases.status,
        decision: disputeCases.decision,
        decisionSummary: disputeCases.decisionSummary,
        decisionAt: disputeCases.decisionAt,
        deadlineAt: disputeCases.deadlineAt,
        ticketSubject: supportTickets.subject,
        jobTitle: jobs.title,
        jobStatus: jobs.status,
        jobPaymentStatus: jobs.paymentStatus,
        jobPayoutStatus: jobs.payoutStatus,
        jobRouterApprovedAt: jobs.routerApprovedAt,
        jobContractorCompletedAt: jobs.contractorCompletedAt,
        jobCustomerApprovedAt: jobs.customerApprovedAt,
        jobPosterUserId: jobs.jobPosterUserId,
        contractorUserId: jobs.contractorUserId,
      })
      .from(disputeCases)
      .innerJoin(supportTickets, eq(supportTickets.id, disputeCases.ticketId))
      .innerJoin(jobs, eq(jobs.id, disputeCases.jobId))
      .where(eq(disputeCases.id, disputeId))
      .limit(1);
    const dispute = rows[0] ?? null;
    if (!dispute) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = dispute.filedByUserId === user.userId || dispute.againstUserId === user.userId;
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const msgs = await db
      .select({
        id: supportMessages.id,
        createdAt: supportMessages.createdAt,
        authorId: supportMessages.authorId,
        message: supportMessages.message,
      })
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, dispute.ticketId))
      .orderBy(asc(supportMessages.createdAt))
      .limit(500);

    const jobPosterId = dispute.jobPosterUserId ?? null;
    const contractorId = dispute.contractorUserId ?? null;

    const posterStatement =
      jobPosterId && dispute.filedByUserId === jobPosterId
        ? dispute.description
        : msgs.find((m) => m.authorId === jobPosterId)?.message ?? null;

    const contractorStatement =
      contractorId && dispute.filedByUserId === contractorId
        ? dispute.description
        : msgs.find((m) => m.authorId === contractorId)?.message ?? null;

    return NextResponse.json({
      dispute: {
        ...dispute,
        createdAt: dispute.createdAt.toISOString(),
        updatedAt: dispute.updatedAt.toISOString(),
        decisionAt: dispute.decisionAt ? dispute.decisionAt.toISOString() : null,
        deadlineAt: dispute.deadlineAt.toISOString(),
        job: {
          id: dispute.jobId,
          title: dispute.jobTitle,
          status: dispute.jobStatus,
          paymentStatus: dispute.jobPaymentStatus,
          payoutStatus: dispute.jobPayoutStatus,
          routerApprovedAt: dispute.jobRouterApprovedAt ? (dispute.jobRouterApprovedAt as any).toISOString() : null,
          contractorCompletedAt: dispute.jobContractorCompletedAt ? (dispute.jobContractorCompletedAt as any).toISOString() : null,
          customerApprovedAt: dispute.jobCustomerApprovedAt ? (dispute.jobCustomerApprovedAt as any).toISOString() : null,
        },
        statements: {
          jobPoster: posterStatement,
          contractor: contractorStatement,
        },
        // Client can render conversation separately; kept here for timeline context.
        messages: msgs.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

