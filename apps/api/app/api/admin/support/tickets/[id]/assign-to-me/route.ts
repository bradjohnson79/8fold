import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { supportTickets } from "@/db/schema/supportTicket";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);

    const updated = await db.transaction(async (tx: any) => {
      if (!auth.isAdmin) {
        const currentRows = await tx
          .select({ assignedToId: supportTickets.assignedToId })
          .from(supportTickets)
          .where(eq(supportTickets.id, id))
          .limit(1);
        const current = currentRows[0] ?? null;
        if (!current) throw Object.assign(new Error("Not found"), { status: 404 });
        if (current.assignedToId && current.assignedToId !== auth.user.userId) {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        }
      }

      const now = new Date();
      const updatedRows = await tx
        .update(supportTickets)
        .set({ assignedToId: auth.user.userId, updatedAt: now } as any)
        .where(eq(supportTickets.id, id))
        .returning({ id: supportTickets.id, assignedToId: supportTickets.assignedToId, updatedAt: supportTickets.updatedAt });
      const t = updatedRows[0] ?? null;
      if (!t) throw Object.assign(new Error("Not found"), { status: 404 });

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.user.userId,
        action: "SUPPORT_TICKET_ASSIGNED",
        entityType: "SupportTicket",
        entityId: t.id,
        metadata: { assignedToId: auth.user.userId } as any,
      });

      return t;
    });

    return NextResponse.json({
      ok: true,
      data: { ticket: { ...updated, updatedAt: updated.updatedAt.toISOString() } },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/tickets/[id]/assign-to-me", {
      route: "/api/admin/support/tickets/[id]/assign-to-me",
      userId: auth.user.userId,
    });
  }
}
