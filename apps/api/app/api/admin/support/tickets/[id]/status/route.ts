import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { supportTickets } from "@/db/schema/supportTicket";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

const BodySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
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

    // Senior routers can move OPEN/IN_PROGRESS/RESOLVED; only Admin can CLOSED.
    if (String(actor.role) !== "ADMIN" && body.data.status === "CLOSED") {
      return NextResponse.json({ ok: false, error: "Only Admin can close tickets" }, { status: 403 });
    }

    const now = new Date();
    const updated = await db.transaction(async (tx: any) => {
      const rows = await tx
        .update(supportTickets)
        .set({ status: body.data.status, updatedAt: now })
        .where(eq(supportTickets.id, id))
        .returning({ id: supportTickets.id, status: supportTickets.status, updatedAt: supportTickets.updatedAt });

      const t = rows[0] ?? null;
      if (!t) return null;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: actor.userId,
        action: "SUPPORT_TICKET_STATUS_CHANGED",
        entityType: "SupportTicket",
        entityId: t.id,
        metadata: { status: t.status },
      });

      return t;
    });

    if (!updated) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      data: {
        ticket: { ...updated, updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : new Date(0).toISOString() },
      },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/tickets/[id]/status", {
      route: "/api/admin/support/tickets/[id]/status",
      userId: auth.user.userId,
    });
  }
}
