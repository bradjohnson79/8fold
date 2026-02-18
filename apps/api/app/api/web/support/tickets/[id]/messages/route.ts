import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireUser } from "@/src/auth/rbac";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { disputeCases } from "@/db/schema/disputeCase";
import { supportMessages } from "@/db/schema/supportMessage";
import { supportTickets } from "@/db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

const BodySchema = z.object({
  message: z.string().trim().min(1).max(5000)
});

function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json({ ok: true, data }, { status: init?.status ?? 200 });
}
function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const id = getIdFromUrl(req);
    if (!id) return fail(400, "Invalid request");
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return fail(400, "Invalid input");
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return fail(400, "Invalid input");

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
    if (!ticket) return fail(404, "Ticket not found");

    const role = String((user as any).role ?? "").toUpperCase();
    const isAdmin = role === "ADMIN";
    const isCreator = ticket.createdById === user.userId;
    const isAgainstParty = ticket.type === "DISPUTE" && ticket.againstUserId === user.userId;
    // Help tickets remain 1:1 requester support threads; disputes are 2-party threads.
    if (!isAdmin && !isCreator && !isAgainstParty) return fail(403, "Forbidden");

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

    return ok({ message: { ...msg, createdAt: msg.createdAt.toISOString() } }, { status: 201 });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

// Avoid Next.js automatic 405s on known routes.
export async function GET() {
  return fail(404, "Not found");
}
export async function PATCH() {
  return fail(404, "Not found");
}
export async function PUT() {
  return fail(404, "Not found");
}
export async function DELETE() {
  return fail(404, "Not found");
}
