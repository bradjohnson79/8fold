import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { supportMessages } from "@/db/schema/supportMessage";
import { supportTickets } from "@/db/schema/supportTicket";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

const BodySchema = z.object({
  message: z.string().trim().min(1).max(5000),
});

export async function POST(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const actor = auth.user;
    const id = getIdFromUrl(req);
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

    const created = await db.transaction(async (tx: any) => {
      const exists = await tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
      if (!exists[0]?.id) throw Object.assign(new Error("Not found"), { status: 404 });

      const now = new Date();
      const msgRows = await tx
        .insert(supportMessages)
        .values({
          id: crypto.randomUUID(),
          ticketId: id,
          authorId: actor.userId,
          message: body.data.message.trim(),
        } as any)
        .returning({ id: supportMessages.id, createdAt: supportMessages.createdAt, ticketId: supportMessages.ticketId, authorId: supportMessages.authorId, message: supportMessages.message });
      const msg = msgRows[0] as any;

      await tx.update(supportTickets).set({ updatedAt: now } as any).where(eq(supportTickets.id, id));

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: actor.userId,
        action: "SUPPORT_TICKET_STAFF_MESSAGE_ADDED",
        entityType: "SupportTicket",
        entityId: id,
      });

      return msg;
    });

    return NextResponse.json(
      {
        ok: true,
        data: { message: { ...created, createdAt: created.createdAt.toISOString() } },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/tickets/[id]/messages", {
      route: "/api/admin/support/tickets/[id]/messages",
      userId: auth.user.userId,
    });
  }
}
