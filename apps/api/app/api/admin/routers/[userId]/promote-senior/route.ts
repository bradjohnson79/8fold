import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { routers } from "../../../../../../db/schema/router";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

function getUserIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../routers/:userId/promote-senior
  return parts[parts.length - 3] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = getUserIdFromUrl(req);

    const updated = await db
      .update(routers)
      .set({ isSeniorRouter: true, dailyRouteLimit: 15 } as any)
      .where(eq(routers.userId, userId))
      .returning({
        userId: routers.userId,
        isSeniorRouter: routers.isSeniorRouter,
        dailyRouteLimit: routers.dailyRouteLimit,
        status: routers.status,
        homeCountry: routers.homeCountry,
        homeRegionCode: routers.homeRegionCode,
      });
    const router = updated[0] ?? null;

    if (!router) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    await db.insert(auditLogs).values({
      id: randomUUID(),
        actorUserId: auth.userId,
        action: "ROUTER_PROMOTE_SENIOR",
        entityType: "User",
        entityId: userId,
        metadata: {
          isSeniorRouter: router.isSeniorRouter,
          dailyRouteLimit: router.dailyRouteLimit
        } as any
    });

    return NextResponse.json({ ok: true, data: { router } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/routers/[userId]/promote-senior");
  }
}

