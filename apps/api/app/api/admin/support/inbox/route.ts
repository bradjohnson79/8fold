import { NextResponse } from "next/server";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { supportMessages } from "@/db/schema/supportMessage";
import { supportTickets } from "@/db/schema/supportTicket";

export async function GET(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { user, isAdmin } = auth;
    const url = new URL(req.url);
    const take = Math.min(Math.max(Number(url.searchParams.get("take")) || 50, 1), 100);

    const msgCounts = db
      .select({
        ticketId: supportMessages.ticketId,
        c: sql<number>`count(*)`.as("c"),
      })
      .from(supportMessages)
      .groupBy(supportMessages.ticketId)
      .as("msgCounts");

    const where = isAdmin
      ? undefined
      : or(eq(supportTickets.assignedToId, user.userId), sql`${supportTickets.assignedToId} is null`);

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

    const tickets = rows.map((t: any) => ({
      ...t,
      createdAt: (t.createdAt as Date)?.toISOString?.() ?? String(t.createdAt),
      updatedAt: (t.updatedAt as Date)?.toISOString?.() ?? String(t.updatedAt),
      messageCount: Number(t.messageCount ?? 0),
    }));

    return NextResponse.json({
      ok: true,
      data: {
        tickets,
        meta: { total: tickets.length },
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/support/inbox", {
      route: "/api/admin/support/inbox",
      userId: auth.user.userId,
    });
  }
}
