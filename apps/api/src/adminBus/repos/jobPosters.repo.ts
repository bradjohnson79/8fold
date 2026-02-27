import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { jobPosters, users } from "@/db/schema";
import { tableExists } from "@/src/adminBus/schemaIntrospection";

export type RoleListParams = {
  q: string;
  status: string | null;
  page: number;
  pageSize: number;
};

export function parseRoleListParams(searchParams: URLSearchParams): RoleListParams {
  const q = String(searchParams.get("q") ?? "").trim();
  const statusRaw = String(searchParams.get("status") ?? "").trim().toUpperCase();
  const status = statusRaw && statusRaw !== "ALL" ? statusRaw : null;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? "25") || 25));
  return { q, status, page, pageSize };
}

export async function list(params: RoleListParams) {
  const offset = (params.page - 1) * params.pageSize;
  const hasJobPostersTable = await tableExists("job_posters");

  const where = [eq(users.role, "JOB_POSTER" as any)] as any[];
  if (params.status) where.push(eq(users.status, params.status as any));
  if (params.q) {
    const pat = `%${params.q}%`;
    if (hasJobPostersTable) {
      where.push(sql`(${users.email} ilike ${pat} or ${users.name} ilike ${pat} or ${jobPosters.defaultRegion} ilike ${pat})`);
    } else {
      where.push(sql`(${users.email} ilike ${pat} or ${users.name} ilike ${pat})`);
    }
  }
  const whereClause = and(...where);

  if (!hasJobPostersTable) {
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
        role: "JOB_POSTER",
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
      .leftJoin(jobPosters, eq(jobPosters.userId, users.id))
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
        country: users.country,
        regionCode: jobPosters.defaultRegion,
        totalJobsPosted: jobPosters.totalJobsPosted,
      })
      .from(users)
      .leftJoin(jobPosters, eq(jobPosters.userId, users.id))
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
      role: "JOB_POSTER",
      city: null,
      badges: [
        typeof r.totalJobsPosted === "number" ? `JOBS:${r.totalJobsPosted}` : "PROFILE_MISSING",
      ],
    })),
    totalCount: Number(countRows[0]?.total ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export const jobPostersRepo = {
  parseRoleListParams,
  list,
};
