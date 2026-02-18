import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { routers } from "../../../../../../db/schema/router";
import { routerProfiles } from "../../../../../../db/schema/routerProfile";
import { users } from "../../../../../../db/schema/user";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";

function getUserIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../routers/:userId/approve
  return parts[parts.length - 3] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = getUserIdFromUrl(req);

    const userRows = await db
      .select({ id: users.id, country: users.country, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = userRows[0] ?? null;
    if (!user) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });

    // Role immutability: admin actions must not change user.role.
    // If the user is not already a ROUTER, they must create a new Clerk account.
    if (String((user as any).role ?? "").toUpperCase() !== "ROUTER") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "ROLE_IMMUTABLE",
            message: "Role selection is permanent and cannot be changed.",
          },
        },
        { status: 409 },
      );
    }

    const profileRows = await db
      .select({ stateProvince: (routerProfiles as any).stateProvince })
      .from(routerProfiles)
      .where(eq(routerProfiles.userId, userId))
      .limit(1);
    const routerProfile = profileRows[0] ?? null;

    const homeRegionCode = String((routerProfile as any)?.stateProvince ?? "").trim().toUpperCase() || "TX";

    const now = new Date();
    const router = await db.transaction(async (tx: any) => {
      // Proxy/approval must never mutate user.role (lifetime immutable).
      await tx.update(users).set({ status: "ACTIVE" } as any).where(eq(users.id, userId));

      await tx
        .insert(routers)
        .values({
          userId,
          homeCountry: user.country ?? "US",
          homeRegionCode,
          status: "ACTIVE",
          dailyRouteLimit: 10,
          termsAccepted: true,
          profileComplete: true,
          createdByAdmin: true,
        } as any)
        .onConflictDoUpdate({
          target: routers.userId,
          set: { status: "ACTIVE", homeCountry: user.country ?? "US", homeRegionCode } as any,
        });

      const routerRows = await tx.select().from(routers).where(eq(routers.userId, userId)).limit(1);
      const router = routerRows[0] ?? null;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: auth.userId,
        action: "ROUTER_APPROVE",
        entityType: "User",
        entityId: userId,
        metadata: {
          router: router
            ? {
                homeCountry: (router as any).homeCountry,
                homeRegionCode: (router as any).homeRegionCode,
                isSeniorRouter: (router as any).isSeniorRouter,
                dailyRouteLimit: (router as any).dailyRouteLimit,
                status: (router as any).status,
              }
            : null,
          at: now.toISOString(),
        } as any,
      });

      return router;
    });

    return NextResponse.json({ ok: true, data: { router } });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/routers/[userId]/approve");
  }
}

