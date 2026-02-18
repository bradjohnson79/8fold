import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/src/auth/rbac";
import { db } from "@/db/drizzle";
import { disputeCases } from "@/db/schema/disputeCase";
import { supportMessages } from "@/db/schema/supportMessage";
import { supportTickets } from "@/db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}
function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const id = getIdFromUrl(req);
    if (!id) return fail(400, "Invalid request");

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
    if (!ticket) return fail(404, "Ticket not found");

    // Transparency: for DISPUTE tickets, allow BOTH parties (filedBy == createdById, and againstUserId) to view thread.
    const role = String((user as any).role ?? "").toUpperCase();
    const isAdmin = role === "ADMIN";
    const isCreator = ticket.createdById === user.userId;
    const isAgainstParty = ticket.type === "DISPUTE" && row?.againstUserId === user.userId;
    if (!isAdmin && !isCreator && !isAgainstParty) return fail(403, "Forbidden");

    const messages = await db
      .select({ id: supportMessages.id, authorId: supportMessages.authorId, message: supportMessages.message, createdAt: supportMessages.createdAt })
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt))
      .limit(500);

    return ok({
      ticket: {
        ...ticket,
        createdAt: (ticket as any).createdAt?.toISOString?.() ?? String((ticket as any).createdAt),
        updatedAt: (ticket as any).updatedAt?.toISOString?.() ?? String((ticket as any).updatedAt),
      },
      messages: messages.map((m: any) => ({ ...m, createdAt: m.createdAt.toISOString() })),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

// Avoid Next.js automatic 405s on known routes.
export async function POST() {
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
