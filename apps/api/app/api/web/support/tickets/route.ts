import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import crypto from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { disputeCases } from "../../../../../db/schema/disputeCase";
import { supportMessages } from "../../../../../db/schema/supportMessage";
import { supportTickets } from "../../../../../db/schema/supportTicket";

const SupportTicketCategorySchema = z.enum(["PRICING", "JOB_POSTING", "ROUTING", "CONTRACTOR", "PAYOUTS", "OTHER"]);
const SupportTicketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);
const SupportTicketTypeSchema = z.enum(["HELP", "DISPUTE"]);
const SupportRoleContextSchema = z.enum(["JOB_POSTER", "ROUTER", "CONTRACTOR"]);

type SupportRoleContext = z.infer<typeof SupportRoleContextSchema>;

function expectedRoleContext(role: string): SupportRoleContext {
  if (role === "ROUTER") return "ROUTER";
  if (role === "CONTRACTOR") return "CONTRACTOR";
  // USER/CUSTOMER/JOB_POSTER are treated as Job Poster context in v1.
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
  type: SupportTicketTypeSchema,
  category: SupportTicketCategorySchema,
  priority: SupportTicketPrioritySchema.optional(),
  roleContext: SupportRoleContextSchema,
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(1).max(5000).optional()
});

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take") ?? 20)));

    const rows = await db
      .select({
        id: supportTickets.id,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        type: supportTickets.type,
        status: supportTickets.status,
        category: supportTickets.category,
        priority: supportTickets.priority,
        roleContext: supportTickets.roleContext,
        subject: supportTickets.subject,
        assignedToId: supportTickets.assignedToId,
        createdById: supportTickets.createdById,
        disputeCase: {
          status: disputeCases.status,
          decision: disputeCases.decision,
          decisionSummary: disputeCases.decisionSummary,
          decisionAt: disputeCases.decisionAt,
        },
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(
        and(
          or(
            eq(supportTickets.createdById, user.userId),
            and(eq(supportTickets.type, "DISPUTE" as any), eq(disputeCases.againstUserId, user.userId)),
          ),
          ...(status ? ([eq(supportTickets.status, status as any)] as any[]) : ([] as any[])),
        ),
      )
      .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
      .limit(take);

    return NextResponse.json({
      tickets: rows.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        disputeCase: (t as any).disputeCase?.status
          ? {
              ...(t as any).disputeCase,
              decisionAt: (t as any).disputeCase.decisionAt ? (t as any).disputeCase.decisionAt.toISOString() : null,
            }
          : null,
      }))
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const body = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { type, category, priority, roleContext, subject, message } = parsed.data;
    const expected = expectedRoleContext(String(user.role));
    if (roleContext !== expected) {
      return NextResponse.json({ error: "roleContext must match your account role" }, { status: 400 });
    }

    const created = await db.transaction(async (tx) => {
      const now = new Date();
      const ticketRows = await tx
        .insert(supportTickets)
        .values({
          id: crypto.randomUUID(),
          type: type as any,
          category: category as any,
          priority: (priority ?? "NORMAL") as any,
          roleContext: roleContext as any,
          subject,
          createdById: user.userId,
          updatedAt: now,
        } as any)
        .returning({
          id: supportTickets.id,
          createdAt: supportTickets.createdAt,
          updatedAt: supportTickets.updatedAt,
          type: supportTickets.type,
          status: supportTickets.status,
          category: supportTickets.category,
          priority: supportTickets.priority,
          roleContext: supportTickets.roleContext,
          subject: supportTickets.subject,
        });
      const ticket = ticketRows[0] as any;

      if (message && message.trim().length > 0) {
        await tx.insert(supportMessages).values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          authorId: user.userId,
          message: message.trim(),
        } as any);
      }

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: type === "DISPUTE" ? "SUPPORT_TICKET_DISPUTE_CREATED" : "SUPPORT_TICKET_HELP_CREATED",
        entityType: "SupportTicket",
        entityId: ticket.id,
        metadata: {
          type,
          category,
          priority: priority ?? "NORMAL",
          roleContext,
        } as any,
      });

      return ticket;
    });

    return NextResponse.json(
      {
        ticket: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString()
        }
      },
      { status: 201 }
    );
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

