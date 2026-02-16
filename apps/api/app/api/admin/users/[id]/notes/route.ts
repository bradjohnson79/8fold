import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { users } from "../../../../../../db/schema/user";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

const BodySchema = z.object({
  note: z.string().trim().min(1).max(4000),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });

    const rows = await db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        action: auditLogs.action,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, "User"), eq(auditLogs.entityId, id), eq(auditLogs.action, "ADMIN_NOTE")))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    const notes = rows.map((r: any) => ({
      id: r.id,
      createdAt: (r.createdAt as any)?.toISOString?.() ?? String(r.createdAt),
      actorUserId: r.actorUserId ?? null,
      note: typeof (r.metadata as any)?.note === "string" ? String((r.metadata as any).note) : "",
    }));

    return NextResponse.json({ ok: true, data: { notes } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/[id]/notes", { userId: auth.userId });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: auth.userId,
      action: "ADMIN_NOTE",
      entityType: "User",
      entityId: id,
      metadata: { note: body.data.note } as any,
    });

    return NextResponse.json({ ok: true, data: {} }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/users/[id]/notes", { userId: auth.userId });
  }
}

