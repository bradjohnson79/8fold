import { z } from "zod";
import { requireSupportRequester } from "../../../../../src/auth/rbac";
import { handleApiError } from "../../../../../src/lib/errorHandler";
import { badRequest, fail, ok } from "../../../../../src/lib/api/respond";
import { addBusinessDays } from "../../../../../src/support/businessDays";
import crypto from "node:crypto";
import { desc, eq, or } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { disputeCases } from "../../../../../db/schema/disputeCase";
import { jobs } from "../../../../../db/schema/job";
import { jobHolds } from "../../../../../db/schema/jobHold";
import { supportMessages } from "../../../../../db/schema/supportMessage";
import { supportTickets } from "../../../../../db/schema/supportTicket";
import { sanitizeText } from "../../../../../src/utils/sanitizeText";

/**
 * Financial safety contract:
 * - Creating a dispute NEVER refunds, releases escrow, or writes ledger/transfer records.
 * - This endpoint only freezes payout by marking the job DISPUTED and adding a DISPUTE JobHold.
 * - Any financial movement (refund/release) is handled by separate, explicitly-invoked finance workflows.
 */

const DisputeAgainstRoleSchema = z.enum(["JOB_POSTER", "CONTRACTOR"]);
const DisputeReasonSchema = z.enum(["PRICING", "WORK_QUALITY", "NO_SHOW", "PAYMENT", "OTHER"]);
const SupportRoleContextSchema = z.enum(["JOB_POSTER", "ROUTER", "CONTRACTOR"]);
const SupportTicketCategorySchema = z.enum([
  "PRICING",
  "JOB_POSTING",
  "ROUTING",
  "CONTRACTOR",
  "PAYOUTS",
  "AI_APPRAISAL_FAILURE",
  "OTHER",
]);
const SupportTicketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);

type SupportRoleContext = z.infer<typeof SupportRoleContextSchema>;

function expectedRoleContext(role: string): SupportRoleContext {
  if (role === "ROUTER") return "ROUTER";
  if (role === "CONTRACTOR") return "CONTRACTOR";
  return "JOB_POSTER";
}

const CreateSchema = z.object({
  jobId: z.string().min(5),
  againstUserId: z.string().min(5),
  againstRole: DisputeAgainstRoleSchema,
  disputeReason: DisputeReasonSchema,
  // User statement (required; min 100 chars per v1 policy).
  description: z.string().trim().min(100).max(5000),
  subject: z.string().trim().min(3).max(160),
  roleContext: SupportRoleContextSchema,
  category: SupportTicketCategorySchema.optional(),
  priority: SupportTicketPrioritySchema.optional(),
  message: z.string().trim().min(1).max(5000).optional(),
});

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);

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
      })
      .from(disputeCases)
      .innerJoin(supportTickets, eq(supportTickets.id, disputeCases.ticketId))
      .where(or(eq(disputeCases.filedByUserId, user.userId), eq(disputeCases.againstUserId, user.userId)))
      .orderBy(desc(disputeCases.updatedAt), desc(disputeCases.id))
      .limit(100);

    return ok({
      disputes: rows.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        decisionAt: d.decisionAt ? d.decisionAt.toISOString() : null,
        deadlineAt: d.deadlineAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/web/support/disputes");
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return badRequest("invalid_json");
    }
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return badRequest("invalid_input");
    }

    const input = parsed.data;
    const safe = {
      subject: sanitizeText(input.subject, { maxLen: 160 }),
      description: sanitizeText(input.description, { maxLen: 5000 }),
      message: input.message ? sanitizeText(input.message, { maxLen: 5000 }) : undefined,
    };
    const expected = expectedRoleContext(String(user.role));
    if (input.roleContext !== expected) {
      return badRequest("role_context_mismatch");
    }

    // Ensure job exists (and is not a mock job).
    const jobRows = await db
      .select({
        id: jobs.id,
        isMock: jobs.isMock,
        status: jobs.status,
        paymentStatus: jobs.paymentStatus,
        payoutStatus: jobs.payoutStatus,
        routerApprovedAt: jobs.routerApprovedAt,
        jobPosterUserId: jobs.jobPosterUserId,
        contractorUserId: jobs.contractorUserId,
      })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return fail(404, "job_not_found");
    if (job.isMock) return badRequest("mock_job_cannot_be_disputed");

    // Dispute eligibility (frontend mirrors this).
    if (String(job.paymentStatus ?? "") !== "FUNDED") {
      return fail(409, "job_not_funded");
    }
    if (String(job.payoutStatus ?? "") === "RELEASED") {
      return fail(409, "payout_already_released");
    }
    if (job.routerApprovedAt) {
      return fail(409, "completion_already_approved");
    }
    if (String(job.status ?? "") === "DISPUTED") {
      return fail(409, "job_already_disputed");
    }

    // Authorization: only job participants can file disputes, and the "against" must match the other participant.
    const involved = job.jobPosterUserId === user.userId || job.contractorUserId === user.userId;
    if (!involved) return fail(403, "forbidden");
    const expectedAgainstUserId =
      job.jobPosterUserId === user.userId ? (job.contractorUserId ?? "") : (job.jobPosterUserId ?? "");
    const expectedAgainstRole = job.jobPosterUserId === user.userId ? ("CONTRACTOR" as const) : ("JOB_POSTER" as const);
    if (!expectedAgainstUserId) {
      return badRequest("job_participants_not_ready");
    }
    if (input.againstUserId !== expectedAgainstUserId || input.againstRole !== expectedAgainstRole) {
      return badRequest("against_must_match_other_participant");
    }

    const now = new Date();
    const deadlineAt = addBusinessDays(now, 15);

    const created = await db.transaction(async (tx) => {
      const ticketRows = await tx
        .insert(supportTickets)
        .values({
          id: crypto.randomUUID(),
          type: "DISPUTE",
          status: "OPEN",
          category: (input.category ?? "OTHER") as any,
          priority: (input.priority ?? "NORMAL") as any,
          createdById: user.userId,
          roleContext: input.roleContext as any,
          subject: safe.subject,
          updatedAt: now,
        } as any)
        .returning({ id: supportTickets.id, createdAt: supportTickets.createdAt, updatedAt: supportTickets.updatedAt });
      const ticket = ticketRows[0] as any;

      const disputeRows = await tx
        .insert(disputeCases)
        .values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          jobId: input.jobId,
          filedByUserId: user.userId,
          againstUserId: input.againstUserId,
          againstRole: input.againstRole as any,
          disputeReason: input.disputeReason as any,
          description: safe.description,
          status: "SUBMITTED",
          deadlineAt,
          updatedAt: now,
        } as any)
        .returning({
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
        });
      const dispute = disputeRows[0] as any;

      // Freeze payout by marking job disputed + placing a hold.
      await tx
        .update(jobs)
        .set({
          status: "DISPUTED" as any,
        })
        .where(eq(jobs.id, input.jobId));

      await tx.insert(jobHolds).values({
        id: crypto.randomUUID(),
        status: "ACTIVE" as any,
        jobId: input.jobId,
        reason: "DISPUTE" as any,
        notes: `Dispute case ${dispute.id}`,
        appliedByUserId: user.userId,
        sourceDisputeCaseId: dispute.id,
      } as any);

      if (safe.message && safe.message.trim().length > 0) {
        await tx.insert(supportMessages).values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          authorId: user.userId,
          message: safe.message.trim(),
        } as any);
      }

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "DISPUTE_CASE_SUBMITTED",
        entityType: "DisputeCase",
        entityId: dispute.id,
        metadata: {
          ticketId: ticket.id,
          jobId: input.jobId,
          againstUserId: input.againstUserId,
          againstRole: input.againstRole,
          disputeReason: input.disputeReason,
          deadlineAt: deadlineAt.toISOString(),
          sanitized: true,
          truncated: {
            subject: safe.subject.length < input.subject.length,
            description: safe.description.length < input.description.length,
            message: Boolean(input.message && safe.message && safe.message.length < input.message.length),
          },
        } as any,
      });

      return { ticketId: ticket.id, dispute };
    });

    return ok(
      {
        ticketId: created.ticketId,
        dispute: {
          ...created.dispute,
          createdAt: created.dispute.createdAt.toISOString(),
          updatedAt: created.dispute.updatedAt.toISOString(),
          decisionAt: created.dispute.decisionAt ? created.dispute.decisionAt.toISOString() : null,
          deadlineAt: created.dispute.deadlineAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err, "POST /api/web/support/disputes");
  }
}

