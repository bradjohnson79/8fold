import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { routers, users } from "../../../../../db/schema";

const QuerySchema = z.object({
  cursor: z.string().trim().min(1).optional()
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });

    const take = 50;
    const cursorUserId = parsed.data.cursor ?? null;
    const cursorRow = cursorUserId
      ? (
          await db
            .select({ createdAt: routers.createdAt, userId: routers.userId })
            .from(routers)
            .where(eq(routers.userId, cursorUserId))
            .limit(1)
        )[0] ?? null
      : null;

    const cursorWhere = cursorRow
      ? or(lt(routers.createdAt, cursorRow.createdAt), and(eq(routers.createdAt, cursorRow.createdAt), lt(routers.userId, cursorRow.userId)))
      : undefined;

    const rows = await db
      .select({
        router: {
          userId: routers.userId,
          homeCountry: routers.homeCountry,
          homeRegionCode: routers.homeRegionCode,
          homeCity: routers.homeCity,
          isSeniorRouter: routers.isSeniorRouter,
          dailyRouteLimit: routers.dailyRouteLimit,
          routesCompleted: routers.routesCompleted,
          routesFailed: routers.routesFailed,
          rating: routers.rating,
          status: routers.status,
          createdAt: routers.createdAt,
        },
        user: {
          email: users.email,
          phone: users.phone,
          name: users.name,
          role: users.role,
          status: users.status,
          country: users.country,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(routers)
      .innerJoin(users, eq(users.id, routers.userId))
      .where(cursorWhere as any)
      .orderBy(desc(routers.createdAt), desc(routers.userId))
      .limit(take + 1);

    const page = rows.slice(0, take);
    const nextCursor = rows.length > take ? rows[take]?.router?.userId ?? null : null;

    return NextResponse.json({
      ok: true,
      data: {
        routers: page.map((r: any) => ({
        ...r.router,
        createdAt: (r.router.createdAt as any)?.toISOString?.() ?? String(r.router.createdAt),
        user: {
          ...r.user,
          createdAt: (r.user.createdAt as any)?.toISOString?.() ?? String(r.user.createdAt),
          updatedAt: (r.user.updatedAt as any)?.toISOString?.() ?? String(r.user.updatedAt),
        },
      })),
        nextCursor,
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users/routers", { userId: auth.userId });
  }
}

