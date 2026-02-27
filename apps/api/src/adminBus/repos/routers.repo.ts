import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { routers, users } from "@/db/schema";
import { tableExists } from "@/src/adminBus/schemaIntrospection";
import { parseRoleListParams, type RoleListParams } from "@/src/adminBus/repos/jobPosters.repo";

export { parseRoleListParams };

export async function list(params: RoleListParams) {
  const offset = (params.page - 1) * params.pageSize;
  const hasRouters = await tableExists("routers");

  const where = [eq(users.role, "ROUTER" as any)] as any[];
  if (params.status) where.push(eq(users.status, params.status as any));
  if (params.q) {
    const pat = `%${params.q}%`;
    where.push(
      hasRouters
        ? sql`(${users.email} ilike ${pat} or ${users.name} ilike ${pat} or ${routers.homeRegionCode} ilike ${pat} or ${routers.homeCity} ilike ${pat})`
        : sql`(${users.email} ilike ${pat} or ${users.name} ilike ${pat})`,
    );
  }
  const whereClause = and(...where);

  if (!hasRouters) {
    const [countRows, rows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(users).where(whereClause),
      db
        .select({
          id: users.id,
          email: users.email,
          phone: users.phone,
          name: users.name,
          status: users.status,
          createdAt: users.createdAt,
          suspendedUntil: users.suspendedUntil,
          archivedAt: users.archivedAt,
          country: users.country,
          regionCode: users.stateCode,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(params.pageSize)
        .offset(offset),
    ]);

    return {
      rows: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        role: "ROUTER",
        city: null,
        badges: ["PROFILE_MISSING"],
      })),
      totalCount: Number(countRows[0]?.total ?? 0),
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const [countRows, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .leftJoin(routers, eq(routers.userId, users.id))
      .where(whereClause),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        name: users.name,
        status: users.status,
        createdAt: users.createdAt,
        suspendedUntil: users.suspendedUntil,
        archivedAt: users.archivedAt,
        country: routers.homeCountry,
        regionCode: routers.homeRegionCode,
        city: routers.homeCity,
        isSeniorRouter: routers.isSeniorRouter,
      })
      .from(users)
      .leftJoin(routers, eq(routers.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      role: "ROUTER",
      badges: [r.isSeniorRouter ? "SENIOR" : "ROUTER"],
    })),
    totalCount: Number(countRows[0]?.total ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export const routersRepo = {
  parseRoleListParams,
  list,
};
