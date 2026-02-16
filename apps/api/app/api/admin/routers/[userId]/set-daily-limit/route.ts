import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { routers } from "../../../../../../db/schema/router";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getUserIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../routers/:userId/set-daily-limit
  return parts[parts.length - 3] ?? "";
}

const BodySchema = z.object({
  dailyRouteLimit: z.number().int().min(1).max(100)
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = getUserIdFromUrl(req);

    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

    const updated = await db
      .update(routers)
      .set({ dailyRouteLimit: body.data.dailyRouteLimit } as any)
      .where(eq(routers.userId, userId))
      .returning({ userId: routers.userId, dailyRouteLimit: routers.dailyRouteLimit });
    const router = updated[0] ?? null;

    if (!router) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    await db.insert(auditLogs).values({
      id: randomUUID(),
        actorUserId: auth.userId,
        action: "ROUTER_SET_DAILY_LIMIT",
        entityType: "User",
        entityId: userId,
        metadata: { dailyRouteLimit: router.dailyRouteLimit } as any,
    });

    return NextResponse.json({ ok: true, data: { router } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/routers/[userId]/set-daily-limit");
  }
}

