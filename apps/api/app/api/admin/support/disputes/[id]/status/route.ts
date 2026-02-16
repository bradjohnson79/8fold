import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { requireAdminOrSeniorRouter } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { disputeCases } from "@/db/schema/disputeCase";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("disputes") + 1;
  return parts[idx] ?? "";
}

const BodySchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO", "DECIDED", "CLOSED"]),
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

    const isAdmin = String(actor.role) === "ADMIN";
    if (!isAdmin && (body.data.status === "DECIDED" || body.data.status === "CLOSED")) {
      return NextResponse.json({ ok: false, error: "Only Admin can finalize/close disputes" }, { status: 403 });
    }

    const updated = await db.transaction(async (tx: any) => {
      const now = new Date();
      const updatedRows = await tx
        .update(disputeCases)
        .set({ status: body.data.status as any, updatedAt: now } as any)
        .where(eq(disputeCases.id, id))
        .returning({ id: disputeCases.id, status: disputeCases.status, updatedAt: disputeCases.updatedAt, ticketId: disputeCases.ticketId });
      const d = updatedRows[0] ?? null;
      if (!d) throw Object.assign(new Error("Not found"), { status: 404 });

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: actor.userId,
        action: "DISPUTE_STATUS_CHANGED",
        entityType: "DisputeCase",
        entityId: d.id,
        metadata: { status: d.status, ticketId: d.ticketId } as any,
      });
      return d;
    });

    return NextResponse.json({
      ok: true,
      data: { dispute: { ...updated, updatedAt: updated.updatedAt.toISOString() } },
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/support/disputes/[id]/status", {
      route: "/api/admin/support/disputes/[id]/status",
      userId: auth.user.userId,
    });
  }
}
