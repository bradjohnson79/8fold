import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { routers } from "@/db/schema/router";
import { supportTickets } from "@/db/schema/supportTicket";
import { users } from "@/db/schema/user";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("tickets") + 1;
  return parts[idx] ?? "";
}

const BodySchema = z.object({
  assignedToId: z.string().nullable(), // null to unassign
});

export async function POST(req: Request) {
  const auth = await requireAdminOrSeniorRouter(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = getIdFromUrl(req);
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

    // Only allow assignment to ADMIN or Senior Router (or null).
    const assignedToId = body.data.assignedToId;
    if (!auth.isAdmin) {
      // Senior router can only assign to self (and cannot unassign).
      if (!assignedToId || assignedToId !== auth.user.userId) {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }
    if (assignedToId) {
      const rows = await db
        .select({
          id: users.id,
          role: users.role,
          isSeniorRouter: routers.isSeniorRouter,
          routerStatus: routers.status,
        })
        .from(users)
        .leftJoin(routers, eq(routers.userId, users.id))
        .where(eq(users.id, assignedToId))
        .limit(1);
      const u = rows[0] ?? null;
      const isAdmin = String(u?.role) === "ADMIN";
      const isSeniorRouter = Boolean(u?.isSeniorRouter && u?.routerStatus === "ACTIVE");
      if (!u || (!isAdmin && !isSeniorRouter)) {
        return NextResponse.json({ ok: false, error: "Assignee must be Admin or Senior Router" }, { status: 400 });
      }
    }

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
        .set({ assignedToId: assignedToId ?? null, updatedAt: now } as any)
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
        metadata: { assignedToId } as any,
      });
      return t;
    });

    return NextResponse.json({
      ok: true,
      data: { ticket: { ...updated, updatedAt: updated.updatedAt.toISOString() } },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/tickets/[id]/assign", {
      route: "/api/admin/support/tickets/[id]/assign",
      userId: auth.user.userId,
    });
  }
}
