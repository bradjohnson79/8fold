import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../../src/http/errors";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { disputeCases } from "../../../../../../../db/schema/disputeCase";
import { supportMessages } from "../../../../../../../db/schema/supportMessage";
import { supportTickets } from "../../../../../../../db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

const BodySchema = z.object({
  message: z.string().trim().min(1).max(5000)
});

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const id = getIdFromUrl(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const rows = await db
      .select({
        id: supportTickets.id,
        createdById: supportTickets.createdById,
        status: supportTickets.status,
        type: supportTickets.type,
        againstUserId: disputeCases.againstUserId,
      })
      .from(supportTickets)
      .leftJoin(disputeCases, eq(disputeCases.ticketId, supportTickets.id))
      .where(eq(supportTickets.id, id))
      .limit(1);
    const ticket = rows[0] ?? null;
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isCreator = ticket.createdById === user.userId;
    const isAgainstParty = ticket.type === "DISPUTE" && ticket.againstUserId === user.userId;
    // Help tickets remain 1:1 requester support threads; disputes are 2-party threads.
    if (!isCreator && !isAgainstParty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const msg = await db.transaction(async (tx) => {
      const now = new Date();
      const createdRows = await tx
        .insert(supportMessages)
        .values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          authorId: user.userId,
          message: body.data.message.trim(),
        } as any)
        .returning({
          id: supportMessages.id,
          createdAt: supportMessages.createdAt,
          message: supportMessages.message,
          authorId: supportMessages.authorId,
          ticketId: supportMessages.ticketId,
        });
      const created = createdRows[0] as any;

      // Touch ticket updatedAt via an update (no content mutation; just updatedAt semantics)
      await tx.update(supportTickets).set({ status: ticket.status as any, updatedAt: now } as any).where(eq(supportTickets.id, ticket.id));

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: user.userId,
        action: "SUPPORT_TICKET_MESSAGE_ADDED",
        entityType: "SupportTicket",
        entityId: ticket.id,
      });
      return created;
    });

    return NextResponse.json({ message: { ...msg, createdAt: msg.createdAt.toISOString() } }, { status: 201 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

