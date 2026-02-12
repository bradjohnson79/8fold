import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { db } from "../../../../db/drizzle";
import { contractorAccounts, jobPosters, routers, users } from "../../../../db/schema";

const QuerySchema = z.object({
  role: z.enum(["USER", "ADMIN", "CUSTOMER", "CONTRACTOR", "ROUTER", "JOB_POSTER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING"]).optional(),
  country: z.enum(["US", "CA"]).optional(),
  region: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional()
});

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      role: url.searchParams.get("role") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      country: url.searchParams.get("country") ?? undefined,
      region: url.searchParams.get("region") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const { role, status, country, region, search, cursor } = parsed.data;

    const take = 50;

    // Cursor paging: mirror Prisma behavior (order by createdAt desc, id desc) while cursor is `id`.
    const cursorId = cursor ?? null;
    const cursorRow = cursorId
      ? (
          await db
            .select({ createdAt: users.createdAt, id: users.id })
            .from(users)
            .where(eq(users.id, cursorId))
            .limit(1)
        )[0] ?? null
      : null;

    const cursorWhere = cursorRow
      ? or(lt(users.createdAt, cursorRow.createdAt), and(eq(users.createdAt, cursorRow.createdAt), lt(users.id, cursorRow.id)))
      : undefined;

    const baseWhereParts: any[] = [];
    if (role) baseWhereParts.push(eq(users.role, role as any));
    if (status) baseWhereParts.push(eq(users.status, status as any));
    if (country) baseWhereParts.push(eq(users.country, country as any));

    if (search) {
      const pat = `%${search}%`;
      baseWhereParts.push(
        or(
          ilike(users.email, pat),
          ilike(users.name, pat),
          ilike(users.phone, pat),
        ) as any,
      );
    }

    // Region filter uses role extension tables.
    if (region) {
      const r = region.toUpperCase();
      if (role === "ROUTER") {
        baseWhereParts.push(eq(routers.homeRegionCode, r) as any);
      } else if (role === "JOB_POSTER") {
        baseWhereParts.push(ilike(jobPosters.defaultRegion, `%${region}%`) as any);
      } else if (role === "CONTRACTOR") {
        baseWhereParts.push(eq(contractorAccounts.regionCode, r) as any);
      } else if (!role) {
        baseWhereParts.push(
          or(
            eq(routers.homeRegionCode, r),
            eq(contractorAccounts.regionCode, r),
            ilike(jobPosters.defaultRegion, `%${region}%`),
          ) as any,
        );
      }
    }

    const where = and(...baseWhereParts, ...(cursorWhere ? [cursorWhere] : []));

    const rows = await db
      .select({
        user: {
          id: users.id,
          email: users.email,
          phone: users.phone,
          name: users.name,
          role: users.role,
          status: users.status,
          country: users.country,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
        jobPoster: {
          userId: jobPosters.userId,
          defaultRegion: jobPosters.defaultRegion,
          totalJobsPosted: jobPosters.totalJobsPosted,
          lastJobPostedAt: jobPosters.lastJobPostedAt,
          createdAt: jobPosters.createdAt,
          createdByAdmin: jobPosters.createdByAdmin,
          isActive: jobPosters.isActive,
          isMock: jobPosters.isMock,
          isTest: jobPosters.isTest,
        },
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
        contractorAccount: {
          userId: contractorAccounts.userId,
          tradeCategory: contractorAccounts.tradeCategory,
          serviceRadiusKm: contractorAccounts.serviceRadiusKm,
          country: contractorAccounts.country,
          regionCode: contractorAccounts.regionCode,
          city: contractorAccounts.city,
          isApproved: contractorAccounts.isApproved,
          jobsCompleted: contractorAccounts.jobsCompleted,
          rating: contractorAccounts.rating,
          createdAt: contractorAccounts.createdAt,
        },
      })
      .from(users)
      .leftJoin(jobPosters, eq(jobPosters.userId, users.id))
      .leftJoin(routers, eq(routers.userId, users.id))
      .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
      .where(where as any)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(take + 1);

    const page = rows.slice(0, take);
    const nextCursor = rows.length > take ? rows[take]?.user?.id ?? null : null;

    return NextResponse.json({
      users: page.map((r) => ({
        ...r.user,
        createdAt: (r.user.createdAt as any)?.toISOString?.() ?? String(r.user.createdAt),
        updatedAt: (r.user.updatedAt as any)?.toISOString?.() ?? String(r.user.updatedAt),
        jobPoster: r.jobPoster?.userId ? { ...r.jobPoster, lastJobPostedAt: (r.jobPoster.lastJobPostedAt as any)?.toISOString?.() ?? null, createdAt: (r.jobPoster.createdAt as any)?.toISOString?.() ?? String(r.jobPoster.createdAt) } : null,
        router: r.router?.userId ? { ...r.router, createdAt: (r.router.createdAt as any)?.toISOString?.() ?? String(r.router.createdAt) } : null,
        contractorAccount: r.contractorAccount?.userId
          ? { ...r.contractorAccount, createdAt: (r.contractorAccount.createdAt as any)?.toISOString?.() ?? String(r.contractorAccount.createdAt) }
          : null,
      })),
      nextCursor,
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    if (process.env.ADMIN_AUDIT_LOG === "1" && status >= 500) {
      const traceId = req.headers.get("x-admin-trace-id") ?? null;
      const pg: any = err && typeof err === "object" ? (err as any) : null;
      // eslint-disable-next-line no-console
      console.error("[ADMIN_AUDIT][API_500]", {
        traceId,
        method: req.method,
        path: new URL(req.url).pathname,
        message,
        err,
        stack: err instanceof Error ? err.stack : undefined,
        pg: pg
          ? {
              code: pg.code,
              detail: pg.detail,
              constraint: pg.constraint,
              column: pg.column,
              table: pg.table,
              schema: pg.schema,
            }
          : null,
      });
    }
    return NextResponse.json({ error: message }, { status });
  }
}

