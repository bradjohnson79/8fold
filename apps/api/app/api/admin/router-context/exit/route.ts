import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { adminRouterContexts } from "../../../../../db/schema/adminRouterContext";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { routingHubs } from "../../../../../db/schema/routingHub";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();

    const activeRows = await db
      .select({
        id: adminRouterContexts.id,
        country: adminRouterContexts.country,
        regionCode: adminRouterContexts.regionCode,
        hubCity: routingHubs.hubCity,
      })
      .from(adminRouterContexts)
      .innerJoin(routingHubs, eq(adminRouterContexts.routingHubId, routingHubs.id))
      .where(and(eq(adminRouterContexts.adminId, auth.userId), isNull(adminRouterContexts.deactivatedAt)))
      .limit(1);
    const active = activeRows[0] ?? null;

    await db
      .update(adminRouterContexts)
      .set({ deactivatedAt: now })
      .where(and(eq(adminRouterContexts.adminId, auth.userId), isNull(adminRouterContexts.deactivatedAt)));

    if (active) {
      await db.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_CONTEXT_EXIT",
        entityType: "AdminRouterContext",
        entityId: active.id,
        metadata: {
          actorRole: "ADMIN",
          country: active.country,
          regionCode: active.regionCode,
          hubCity: active.hubCity,
        } as any,
      });
    }

    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/router-context/exit");
  }
}

