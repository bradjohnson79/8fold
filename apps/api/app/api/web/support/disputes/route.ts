import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { addBusinessDays } from "../../../../../src/support/businessDays";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { disputeCases } from "../../../../../db/schema/disputeCase";
import { jobs } from "../../../../../db/schema/job";
import { supportMessages } from "../../../../../db/schema/supportMessage";
import { supportTickets } from "../../../../../db/schema/supportTicket";

const DisputeAgainstRoleSchema = z.enum(["JOB_POSTER", "CONTRACTOR"]);
const DisputeReasonSchema = z.enum(["PRICING", "WORK_QUALITY", "NO_SHOW", "PAYMENT", "OTHER"]);
const SupportRoleContextSchema = z.enum(["JOB_POSTER", "ROUTER", "CONTRACTOR"]);
const SupportTicketCategorySchema = z.enum(["PRICING", "JOB_POSTING", "ROUTING", "CONTRACTOR", "PAYOUTS", "OTHER"]);
const SupportTicketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);

type SupportRoleContext = z.infer<typeof SupportRoleContextSchema>;

function expectedRoleContext(role: string): SupportRoleContext {
  if (role === "ROUTER") return "ROUTER";
  if (role === "CONTRACTOR") return "CONTRACTOR";
  return "JOB_POSTER";
}

async function requireSupportRequester(req: Request) {
  const user = await requireUser(req);
  const r = String(user.role);
  if (r === "ADMIN") throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (r !== "USER" && r !== "CUSTOMER" && r !== "JOB_POSTER" && r !== "ROUTER" && r !== "CONTRACTOR") {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return user;
}

const CreateSchema = z.object({
  jobId: z.string().min(5),
  againstUserId: z.string().min(5),
  againstRole: DisputeAgainstRoleSchema,
  disputeReason: DisputeReasonSchema,
  description: z.string().trim().min(10).max(5000),
  subject: z.string().trim().min(3).max(160),
  roleContext: SupportRoleContextSchema,
  category: SupportTicketCategorySchema.optional(),
  priority: SupportTicketPrioritySchema.optional(),
  message: z.string().trim().min(1).max(5000).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const input = parsed.data;
    const expected = expectedRoleContext(String(user.role));
    if (input.roleContext !== expected) {
      return NextResponse.json({ error: "roleContext must match your account role" }, { status: 400 });
    }

    // Ensure job exists (and is not a mock job).
    const jobRows = await db.select({ id: jobs.id, isMock: jobs.isMock }).from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.isMock) return NextResponse.json({ error: "Mock jobs cannot be disputed" }, { status: 400 });

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
          subject: input.subject,
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
          description: input.description,
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

      if (input.message && input.message.trim().length > 0) {
        await tx.insert(supportMessages).values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          authorId: user.userId,
          message: input.message.trim(),
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
        } as any,
      });

      return { ticketId: ticket.id, dispute };
    });

    return NextResponse.json(
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
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

