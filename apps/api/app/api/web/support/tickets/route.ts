import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { requireUser } from "@/src/auth/rbac";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { disputeCases } from "@/db/schema/disputeCase";
import { supportMessages } from "@/db/schema/supportMessage";
import { supportTickets } from "@/db/schema/supportTicket";

const SupportTicketCategorySchema = z.enum([
  "PRICING",
  "JOB_POSTING",
  "ROUTING",
  "CONTRACTOR",
  "PAYOUTS",
  "AI_APPRAISAL_FAILURE",
  "OTHER",
]);

function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json({ ok: true, data }, { status: init?.status ?? 200 });
}
function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function roleContextFromRole(role: string): "JOB_POSTER" | "ROUTER" | "CONTRACTOR" | "ADMIN" {
  const r = String(role ?? "").toUpperCase();
  if (r === "ADMIN") return "ADMIN";
  if (r === "ROUTER") return "ROUTER";
  if (r === "CONTRACTOR") return "CONTRACTOR";
  return "JOB_POSTER";
}

// Canonical support contract (Phase 3 rebuild):
// POST /api/web/support/tickets
// { category, subject, message }
const CreateSchema = z.object({
  category: SupportTicketCategorySchema,
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(1).max(5000),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take") ?? 20)));

    // List only tickets "owned" by this user:
    // - ticket creator (all tickets)
    // - dispute "against" party (for DISPUTE tickets)
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
        disputeCaseId: disputeCases.id,
        disputeStatus: disputeCases.status,
        disputeDecision: disputeCases.decision,
        disputeDecisionSummary: disputeCases.decisionSummary,
        disputeDecisionAt: disputeCases.decisionAt,
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(
        and(
          or(
            eq(supportTickets.createdById, user.userId),
            and(eq(supportTickets.type, "DISPUTE" as any), eq(disputeCases.againstUserId, user.userId)),
          ),
        ),
      )
      .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
      .limit(take);

    return ok({
      tickets: rows.map((t: any) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        disputeCase: t.disputeCaseId
          ? {
              id: t.disputeCaseId,
              status: t.disputeStatus,
              decision: t.disputeDecision,
              decisionSummary: t.disputeDecisionSummary,
              decisionAt: t.disputeDecisionAt ? t.disputeDecisionAt.toISOString() : null,
            }
          : null,
      })),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const raw = await req.json().catch(() => null);
    if (!raw) return fail(400, "Invalid input");
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) return fail(400, "Invalid input");

    const { category, subject, message } = parsed.data;
    const roleContext = roleContextFromRole(String((user as any).role ?? ""));

    const created = await db.transaction(async (tx) => {
      const now = new Date();
      const ticketRows = await tx
        .insert(supportTickets)
        .values({
          id: crypto.randomUUID(),
          type: "HELP" as any,
          category: category as any,
          priority: "NORMAL" as any,
          roleContext: roleContext as any,
          subject: subject.trim(),
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

      // Always create initial message (canonical contract).
      await tx.insert(supportMessages).values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        authorId: user.userId,
        message: message.trim(),
      } as any);

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "SUPPORT_TICKET_HELP_CREATED",
        entityType: "SupportTicket",
        entityId: ticket.id,
        metadata: {
          type: "HELP",
          category,
          priority: "NORMAL",
          roleContext,
        } as any,
      });

      return ticket;
    });

    return ok(
      {
        ticket: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

// Avoid Next.js automatic 405s on known routes.
export async function PATCH() {
  return fail(404, "Not found");
}
export async function PUT() {
  return fail(404, "Not found");
}
export async function DELETE() {
  return fail(404, "Not found");
}

