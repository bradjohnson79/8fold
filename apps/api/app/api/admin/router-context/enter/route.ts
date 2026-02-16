import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../db/drizzle";
import { adminRouterContexts } from "../../../../../db/schema/adminRouterContext";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { routingHubs } from "../../../../../db/schema/routingHub";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { z } from "zod";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

const BodySchema = z.object({
  country: z.enum(["US", "CA"]),
  regionCode: z.string().trim().min(2).max(4)
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const country = body.data.country;
    const regionCode = body.data.regionCode.toUpperCase();

    const hubRows = await db
      .select({ id: routingHubs.id, hubCity: routingHubs.hubCity, lat: routingHubs.lat, lng: routingHubs.lng })
      .from(routingHubs)
      .where(and(eq(routingHubs.country, country as any), eq(routingHubs.regionCode, regionCode), eq(routingHubs.isAdminOnly, true)))
      .orderBy(asc(routingHubs.createdAt))
      .limit(1);
    const hub = hubRows[0] ?? null;
    if (!hub) {
      return NextResponse.json({ ok: false, error: "no_routing_hub" }, { status: 404 });
    }

    const now = new Date();
    const ctx = await db.transaction(async (tx: any) => {
      // Deactivate any existing active context.
      await tx
        .update(adminRouterContexts)
        .set({ deactivatedAt: now })
        .where(and(eq(adminRouterContexts.adminId, auth.userId), isNull(adminRouterContexts.deactivatedAt)));

      const createdRows = await tx
        .insert(adminRouterContexts)
        .values({
          adminId: auth.userId,
          country: country as any,
          regionCode,
          routingHubId: hub.id,
          activatedAt: now,
        })
        .returning({ id: adminRouterContexts.id, activatedAt: adminRouterContexts.activatedAt });
      const created = createdRows[0] as any;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: auth.userId,
        action: "ADMIN_ROUTER_CONTEXT_ENTER",
        entityType: "AdminRouterContext",
        entityId: created.id,
        metadata: {
          actorRole: "ADMIN",
          country,
          regionCode,
          hubCity: hub.hubCity,
        } as any,
      });

      return created;
    });

    return NextResponse.json({
      ok: true,
      data: {
        context: {
          id: ctx.id,
          country,
          regionCode,
          hubCity: hub.hubCity,
          activatedAt: ctx.activatedAt
        }
      }
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/router-context/enter");
  }
}

