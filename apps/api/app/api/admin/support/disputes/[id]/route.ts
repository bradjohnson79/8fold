import { NextResponse } from "next/server";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { disputeCases } from "@/db/schema/disputeCase";
import { jobs } from "@/db/schema/job";
import { materialsRequests } from "@/db/schema/materialsRequest";
import { supportAttachments } from "@/db/schema/supportAttachment";
import { supportMessages } from "@/db/schema/supportMessage";
import { supportTickets } from "@/db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

export async function GET(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const rows = await db
      .select({ dispute: disputeCases, ticket: supportTickets })
      .from(disputeCases)
      .innerJoin(supportTickets, eq(supportTickets.id, disputeCases.ticketId))
      .where(eq(disputeCases.id, id))
      .limit(1);
    const row = rows[0] ?? null;
    const dispute = row?.dispute ?? null;
    if (!dispute) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const messages = await db
      .select({
        id: supportMessages.id,
        authorId: supportMessages.authorId,
        message: supportMessages.message,
        createdAt: supportMessages.createdAt,
      })
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, dispute.ticketId))
      .orderBy(asc(supportMessages.createdAt))
      .limit(1000);

    const attachments = await db
      .select({
        id: supportAttachments.id,
        originalName: supportAttachments.originalName,
        mimeType: supportAttachments.mimeType,
        sizeBytes: supportAttachments.sizeBytes,
        createdAt: supportAttachments.createdAt,
      })
      .from(supportAttachments)
      .where(eq(supportAttachments.ticketId, dispute.ticketId))
      .orderBy(asc(supportAttachments.createdAt))
      .limit(500);

    const jobRows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        region: jobs.region,
        serviceType: jobs.serviceType,
        tradeCategory: jobs.tradeCategory,
        publishedAt: jobs.publishedAt,
        jobPosterUserId: jobs.jobPosterUserId,
        routerId: jobs.claimedByUserId,
        contractorUserId: jobs.contractorUserId,
        paymentStatus: jobs.paymentStatus,
        payoutStatus: jobs.payoutStatus,
        amountCents: jobs.amountCents,
        paymentCurrency: jobs.paymentCurrency,
        laborTotalCents: jobs.laborTotalCents,
        materialsTotalCents: jobs.materialsTotalCents,
        contractorCompletedAt: jobs.contractorCompletedAt,
        contractorCompletionSummary: jobs.contractorCompletionSummary,
        customerApprovedAt: jobs.customerApprovedAt,
        customerCompletionSummary: jobs.customerCompletionSummary,
        routerApprovedAt: jobs.routerApprovedAt,
      })
      .from(jobs)
      .where(eq(jobs.id, dispute.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;

    const pm = job?.id
      ? await db
          .select({
            id: materialsRequests.id,
            status: materialsRequests.status,
            currency: materialsRequests.currency,
            totalAmountCents: materialsRequests.totalAmountCents,
            submittedAt: materialsRequests.submittedAt,
            approvedAt: materialsRequests.approvedAt,
          })
          .from(materialsRequests)
          .where(eq(materialsRequests.jobId, job.id))
          .orderBy(asc(materialsRequests.submittedAt))
          .limit(200)
      : [];

    return NextResponse.json({
      ok: true,
      data: {
        dispute: {
          ...dispute,
          createdAt: dispute.createdAt.toISOString(),
          updatedAt: dispute.updatedAt.toISOString(),
          decisionAt: dispute.decisionAt ? dispute.decisionAt.toISOString() : null,
          deadlineAt: dispute.deadlineAt.toISOString(),
          ticket: {
            ...(row?.ticket as any),
            createdAt: (row?.ticket as any).createdAt.toISOString(),
            updatedAt: (row?.ticket as any).updatedAt.toISOString(),
          },
        },
        messages: messages.map((m: any) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        attachments: attachments.map((a: any) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          downloadUrl: `/api/web/support/attachments/${a.id}`,
        })),
        job: job
          ? {
              ...job,
              publishedAt: (job as any).publishedAt ? (job as any).publishedAt.toISOString() : null,
              contractorCompletedAt: (job as any).contractorCompletedAt ? (job as any).contractorCompletedAt.toISOString() : null,
              customerApprovedAt: (job as any).customerApprovedAt ? (job as any).customerApprovedAt.toISOString() : null,
              routerApprovedAt: (job as any).routerApprovedAt ? (job as any).routerApprovedAt.toISOString() : null,
            }
          : null,
        pm: pm.map((r: any) => ({
          ...r,
          submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
          approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
        })),
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/support/disputes/[id]", {
      route: "/api/admin/support/disputes/[id]",
      userId: auth.user.userId,
    });
  }
}
