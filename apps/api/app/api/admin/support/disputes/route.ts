import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { getResolvedSchema } from "@/server/db/schemaLock";
import { disputeCases } from "@/db/schema/disputeCase";
import { jobs } from "@/db/schema/job";
import { supportTickets } from "@/db/schema/supportTicket";

// Canonical ops statuses (API layer). Mapped to DB `DisputeStatus` enum.
const OpsStatusSchema = z.enum(["OPEN", "UNDER_REVIEW", "DECIDED", "CLOSED"]);
const DisputeReasonSchema = z.enum(["PRICING", "WORK_QUALITY", "NO_SHOW", "PAYMENT", "OTHER"]);
const DisputeAgainstRoleSchema = z.enum(["JOB_POSTER", "CONTRACTOR"]);

const QuerySchema = z.object({
  status: OpsStatusSchema.optional(),
  reason: DisputeReasonSchema.optional(),
  againstRole: DisputeAgainstRoleSchema.optional(),
  jobId: z.string().optional(),
  take: z.preprocess((v) => Number(v), z.number().int().min(1).max(50).default(50)).optional(),
});

function toDbStatus(s: z.infer<typeof OpsStatusSchema>): "SUBMITTED" | "UNDER_REVIEW" | "DECIDED" | "CLOSED" {
  if (s === "OPEN") return "SUBMITTED";
  return s;
}

function whereForStatus(s: z.infer<typeof OpsStatusSchema>) {
  if (s === "UNDER_REVIEW") return inArray(disputeCases.status, ["UNDER_REVIEW", "NEEDS_INFO"] as any);
  return eq(disputeCases.status, toDbStatus(s) as any);
}

export async function GET(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { user, isAdmin } = auth;
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }

    const { status, reason, againstRole, jobId, take = 50 } = parsed.data;

    const where = and(
      ...(status ? ([whereForStatus(status)] as any[]) : ([] as any[])),
      ...(reason ? ([eq(disputeCases.disputeReason, reason as any)] as any[]) : ([] as any[])),
      ...(againstRole ? ([eq(disputeCases.againstRole, againstRole as any)] as any[]) : ([] as any[])),
      ...(jobId ? ([eq(disputeCases.jobId, jobId)] as any[]) : ([] as any[])),
      ...(isAdmin
        ? ([] as any[])
        : ([
            or(eq(supportTickets.assignedToId, user.userId), sql`${supportTickets.assignedToId} is null`),
          ] as any[])),
    );

    const schema = getResolvedSchema();
    const supportAttachmentsT = sql.raw(`"${schema}"."support_attachments"`);
    const disputeVotesT = sql.raw(`"${schema}"."dispute_votes"`);
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
        status: disputeCases.status,
        decision: disputeCases.decision,
        decisionAt: disputeCases.decisionAt,
        deadlineAt: disputeCases.deadlineAt,
        jobAmountCents: jobs.amount_cents,
        jobCurrency: jobs.payment_currency,
        evidenceCount: sql<number>`(
          select count(*)::int
          from ${supportAttachmentsT} sa
          where sa."ticketId" = ${disputeCases.ticketId}
        )`,
        voteCount: sql<number>`(
          select count(*)::int
          from ${disputeVotesT} dv
          where dv."disputeCaseId" = ${disputeCases.id}
        )`,
        ticket: {
          subject: supportTickets.subject,
          priority: supportTickets.priority,
          category: supportTickets.category,
          status: supportTickets.status,
          assignedToId: supportTickets.assignedToId,
        },
      })
      .from(disputeCases)
      .innerJoin(supportTickets, eq(supportTickets.id, disputeCases.ticketId))
      .innerJoin(jobs, eq(jobs.id, disputeCases.jobId))
      .where(where)
      .orderBy(asc(disputeCases.deadlineAt), desc(disputeCases.createdAt))
      .limit(take);

    const disputes = rows.map((d: any) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      decisionAt: d.decisionAt ? d.decisionAt.toISOString() : null,
      deadlineAt: d.deadlineAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      data: { disputes },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/support/disputes", {
      route: "/api/admin/support/disputes",
      userId: auth.user.userId,
    });
  }
}
