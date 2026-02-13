import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireSeniorRouter } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { supportMessages } from "../../../../../db/schema/supportMessage";
import { supportTickets } from "../../../../../db/schema/supportTicket";

const SupportTicketStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
const SupportTicketTypeSchema = z.enum(["HELP", "DISPUTE"]);
const SupportTicketCategorySchema = z.enum(["PRICING", "JOB_POSTING", "ROUTING", "CONTRACTOR", "PAYOUTS", "OTHER"]);
const SupportTicketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);

const QuerySchema = z.object({
  status: SupportTicketStatusSchema.optional(),
  type: SupportTicketTypeSchema.optional(),
  category: SupportTicketCategorySchema.optional(),
  priority: SupportTicketPrioritySchema.optional(),
  assignedToId: z.string().optional(),
  createdById: z.string().optional(),
  take: z.preprocess((v) => Number(v), z.number().int().min(1).max(50).default(50)).optional(),
});

async function requireAdminOrSeniorRouter(req: Request) {
  try {
    const u = await requireAdmin(req);
    return { user: u, isAdmin: true as const };
  } catch {
    const u = await requireSeniorRouter(req);
    return { user: u, isAdmin: false as const };
  }
}

export async function GET(req: Request) {
  try {
    const { user, isAdmin } = await requireAdminOrSeniorRouter(req);
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }

    const { status, type, category, priority, assignedToId, createdById, take = 50 } = parsed.data;

    const msgCounts = db
      .select({
        ticketId: supportMessages.ticketId,
        c: sql<number>`count(*)`.as("c"),
      })
      .from(supportMessages)
      .groupBy(supportMessages.ticketId)
      .as("msgCounts");

    const where = and(
      ...(status ? ([eq(supportTickets.status, status as any)] as any[]) : ([] as any[])),
      ...(type ? ([eq(supportTickets.type, type as any)] as any[]) : ([] as any[])),
      ...(category ? ([eq(supportTickets.category, category as any)] as any[]) : ([] as any[])),
      ...(priority ? ([eq(supportTickets.priority, priority as any)] as any[]) : ([] as any[])),
      ...(createdById ? ([eq(supportTickets.createdById, createdById)] as any[]) : ([] as any[])),
      // Senior routers can only see unassigned OR assigned-to-them tickets.
      ...(isAdmin
        ? assignedToId
          ? ([eq(supportTickets.assignedToId, assignedToId)] as any[])
          : ([] as any[])
        : ([or(eq(supportTickets.assignedToId, user.userId), sql`${supportTickets.assignedToId} is null`)] as any[])),
    );

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
        createdById: supportTickets.createdById,
        assignedToId: supportTickets.assignedToId,
        messageCount: msgCounts.c,
      })
      .from(supportTickets)
      .leftJoin(msgCounts, eq(msgCounts.ticketId, supportTickets.id))
      .where(where)
      .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
      .limit(take);

    return NextResponse.json({
      tickets: rows.map((t: any) => ({
        ...t,
        createdAt: (t.createdAt as any)?.toISOString?.() ?? String(t.createdAt),
        updatedAt: (t.updatedAt as any)?.toISOString?.() ?? String(t.updatedAt),
        messageCount: Number((t as any).messageCount ?? 0),
      })),
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    if (process.env.ADMIN_AUDIT_LOG === "1" && status >= 500) {
      const traceId = req.headers.get("x-admin-trace-id") ?? null;
      const pg: any = err && typeof err === "object" ? (err as any) : null;
      // eslint-disable-next-line no-console
      console.error("[ADMIN_AUDIT][API_500]", {
        traceId,
        method: req.method,
        path: new URL(req.url).pathname,
        message,
        err,
        stack: err instanceof Error ? err.stack : undefined,
        pg: pg
          ? {
              code: pg.code,
              detail: pg.detail,
              constraint: pg.constraint,
              column: pg.column,
              table: pg.table,
              schema: pg.schema,
            }
          : null,
      });
    }
    return NextResponse.json({ error: message }, { status });
  }
}

