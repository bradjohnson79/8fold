import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";
import { asc, eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { disputeCases } from "../../../../../../db/schema/disputeCase";
import { supportMessages } from "../../../../../../db/schema/supportMessage";
import { supportTickets } from "../../../../../../db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const id = getIdFromUrl(req);

    const rows = await db
      .select({
        ticket: supportTickets,
        againstUserId: disputeCases.againstUserId,
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(eq(supportTickets.id, id))
      .limit(1);
    const row = rows[0] ?? null;
    const ticket = row?.ticket ?? null;
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Transparency: for DISPUTE tickets, allow BOTH parties (filedBy == createdById, and againstUserId) to view thread.
    const isCreator = ticket.createdById === user.userId;
    const isAgainstParty = ticket.type === "DISPUTE" && row?.againstUserId === user.userId;
    if (!isCreator && !isAgainstParty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const messages = await db
      .select({ id: supportMessages.id, authorId: supportMessages.authorId, message: supportMessages.message, createdAt: supportMessages.createdAt })
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt))
      .limit(500);

    return NextResponse.json({
      ticket: {
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString()
      },
      messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

