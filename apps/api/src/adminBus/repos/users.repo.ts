import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { jobs, users } from "@/db/schema";

export type ListUsersParams = {
  role?: "JOB_POSTER" | "ROUTER" | "CONTRACTOR" | "ADMIN";
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  country?: string;
  region?: string;
  city?: string;
  includeSuspended?: boolean;
  includeArchived?: boolean;
  range?: "ALL" | "1D" | "7D" | "30D" | "90D";
};

function toIso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

function normalizeRange(range?: ListUsersParams["range"]): Date | null {
  const r = String(range ?? "").toUpperCase();
  if (r === "1D") return new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (r === "7D") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (r === "30D") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (r === "90D") return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return null;
}

function normalizePage(v: number | undefined): number {
  return Math.max(1, Number(v ?? 1) || 1);
}

function normalizePageSize(v: number | undefined): number {
  return Math.max(1, Math.min(100, Number(v ?? 25) || 25));
}

export async function listUsers(params: ListUsersParams) {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const offset = (page - 1) * pageSize;

  const where: any[] = [];
  if (params.role && params.role !== "ADMIN") where.push(eq(users.role, params.role as any));
  if (params.status && params.status !== "ALL") {
    where.push(eq(users.status, params.status as any));
  } else {
    const statusParts: any[] = [eq(users.status, "ACTIVE" as any)];
    if (params.includeSuspended) statusParts.push(eq(users.status, "SUSPENDED" as any));
    if (params.includeArchived) statusParts.push(eq(users.status, "ARCHIVED" as any));
    where.push(or(...statusParts));
  }

  const rangeCutoff = normalizeRange(params.range);
  if (rangeCutoff) where.push(gte(users.createdAt, rangeCutoff));

  if (params.country) where.push(eq(users.country, params.country as any));

  if (params.q) {
    const pat = `%${params.q.trim()}%`;
    where.push(
      or(
        ilike(users.email, pat),
        ilike(users.name, pat),
        ilike(users.phone, pat),
        ilike(users.stateCode, pat),
        ilike(users.legalCity, pat),
      ),
    );
  }

  if (params.region) {
    const r = params.region.trim().toUpperCase();
    where.push(eq(users.stateCode, r));
  }

  if (params.city) {
    const pat = `%${params.city.trim()}%`;
    where.push(ilike(users.legalCity, pat));
  }

  const whereClause = where.length ? and(...where) : undefined;

  const [countRows, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        authUserId: users.authUserId,
        role: users.role,
        status: users.status,
        name: users.name,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        suspendedUntil: users.suspendedUntil,
        archivedAt: users.archivedAt,
        country: users.country,
        state: users.stateCode,
        city: users.legalCity,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(pageSize)
      .offset(offset),
  ]);

  const out = rows.map((r) => {
    return {
      id: r.id,
      authUserId: r.authUserId,
      name: r.name,
      firstName: null,
      lastName: null,
      email: r.email,
      phone: r.phone,
      role: String(r.role),
      status: String(r.status),
      country: r.country,
      state: r.state,
      regionCode: r.state,
      city: r.city,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
      suspendedUntil: toIso(r.suspendedUntil),
      archivedAt: toIso(r.archivedAt),
      badges: [],
    };
  });

  return {
    rows: out,
    totalCount: Number(countRows[0]?.total ?? 0),
    page,
    pageSize,
    users: out,
    nextCursor: null,
  };
}

export async function getUser(id: string) {
  const rows = await db
    .select({
      id: users.id,
      authUserId: users.authUserId,
      email: users.email,
      phone: users.phone,
      role: users.role,
      status: users.status,
      name: users.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
      archivedAt: users.archivedAt,
      archivedReason: users.archivedReason,
      country: users.country,
      state: users.stateCode,
      city: users.legalCity,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;

  return {
    id: row.id,
    authUserId: row.authUserId ?? null,
    name: row.name,
    firstName: null,
    lastName: null,
    email: row.email,
    phone: row.phone,
    role: String(row.role),
    status: String(row.status),
    country: row.country,
    state: row.state,
    city: row.city,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    suspendedUntil: toIso(row.suspendedUntil),
    suspensionReason: row.suspensionReason ?? null,
    archivedAt: toIso(row.archivedAt),
    archivedReason: row.archivedReason ?? null,
  };
}

export async function getUserRecentJobs(id: string) {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      amountCents: jobs.amount_cents,
      createdAt: jobs.created_at,
      updatedAt: jobs.updated_at,
      isMock: jobs.is_mock,
    })
    .from(jobs)
    .where(
      or(
        eq(jobs.job_poster_user_id, id),
        eq(jobs.contractor_user_id, id),
        eq(jobs.claimed_by_user_id, id),
      ),
    )
    .orderBy(desc(jobs.updated_at))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    rawStatus: String(r.status ?? ""),
    statusRaw: String(r.status ?? ""),
    displayStatus: String(r.status ?? ""),
    amountCents: Number(r.amountCents ?? 0),
    isMock: Boolean(r.isMock),
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }));
}

export const usersRepo = {
  listUsers,
  getUser,
  getUserRecentJobs,
};
