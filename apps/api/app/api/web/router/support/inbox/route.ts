import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { supportTickets } from "../../../../../../db/schema/supportTicket";
import { supportMessages } from "../../../../../../db/schema/supportMessage";
import { requireSeniorRouter } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";

export async function GET(req: Request) {
  try {
    await requireSeniorRouter(req);

    const url = new URL(req.url);
    const status = String(url.searchParams.get("status") ?? "").trim();
    const type = String(url.searchParams.get("type") ?? "").trim();

    const where = and(
      ...(status ? [eq(supportTickets.status as any, status as any)] : []),
      ...(type ? [eq(supportTickets.type as any, type as any)] : []),
    );

    const tickets = await db
      .select({
        id: supportTickets.id,
        type: supportTickets.type,
        status: supportTickets.status,
        category: supportTickets.category,
        priority: supportTickets.priority,
        roleContext: supportTickets.roleContext,
        subject: supportTickets.subject,
        assignedToId: supportTickets.assignedToId,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .where(where)
      .orderBy(desc(supportTickets.updatedAt))
      .limit(100);

    const ids = tickets.map((t) => t.id);
    const counts =
      ids.length === 0
        ? []
        : await db
            .select({
              ticketId: supportMessages.ticketId,
              count: sql<number>`count(*)`,
            })
            .from(supportMessages)
            .where(inArray(supportMessages.ticketId, ids as any))
            .groupBy(supportMessages.ticketId);
    const countById = new Map(counts.map((c) => [c.ticketId, Number((c as any).count ?? 0)]));

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        ...t,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
        updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
        messageCount: countById.get(t.id) ?? 0,
      })),
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

