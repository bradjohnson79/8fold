import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { adminRouterContexts } from "../../../../../db/schema/adminRouterContext";
import { routingHubs } from "../../../../../db/schema/routingHub";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await db
      .select({
        id: adminRouterContexts.id,
        country: adminRouterContexts.country,
        regionCode: adminRouterContexts.regionCode,
        activatedAt: adminRouterContexts.activatedAt,
        deactivatedAt: adminRouterContexts.deactivatedAt,
        hubCity: routingHubs.hubCity,
        lat: routingHubs.lat,
        lng: routingHubs.lng,
      })
      .from(adminRouterContexts)
      .innerJoin(routingHubs, eq(routingHubs.id, adminRouterContexts.routingHubId as any))
      .where(eq(adminRouterContexts.adminId, auth.userId))
      .orderBy(desc(adminRouterContexts.activatedAt))
      .limit(5);

    const chosen = rows.find((r: any) => r.deactivatedAt == null) ?? null;

    if (!chosen) {
      return NextResponse.json({ ok: true, data: { context: null } });
    }

    return NextResponse.json({
      ok: true,
      data: {
        context: {
          id: chosen.id,
          country: chosen.country,
          regionCode: chosen.regionCode,
          hubCity: chosen.hubCity,
          activatedAt: chosen.activatedAt,
          lat: chosen.lat,
          lng: chosen.lng
        },
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/router-context/current");
  }
}

