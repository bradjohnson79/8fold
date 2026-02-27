import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import {
  contractorAccounts,
  conversations,
  internalAccountFlags,
  jobAssignments,
  jobPosters,
  jobs,
  payoutMethods,
  routers,
  users,
  v4ContractorStrikes,
  jobDispatches,
} from "@/db/schema";
import type {
  AdminAccountStatus,
  AdminPayoutReadiness,
  AdminRoleDetail,
  AdminUserJobRef,
  AdminUserListRow,
  AdminUsersListResult,
  AdminUserProfile,
} from "@/src/services/adminV4/types";

type RoleScope = "CONTRACTOR" | "JOB_POSTER" | "ROUTER";

export type ListRoleUsersParams = {
  q: string;
  status: string | null;
  active: boolean | null;
  suspended: boolean | null;
  archived: boolean | null;
  page: number;
  pageSize: number;
};

function asIso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

function parseBoolish(v: string | null): boolean | null {
  const n = String(v ?? "").trim().toLowerCase();
  if (!n) return null;
  if (["1", "true", "yes", "on"].includes(n)) return true;
  if (["0", "false", "no", "off"].includes(n)) return false;
  return null;
}

export function parseRoleUsersListParams(searchParams: URLSearchParams): ListRoleUsersParams {
  const q = String(searchParams.get("q") ?? "").trim();
  const statusRaw = String(searchParams.get("status") ?? "").trim().toUpperCase();
  const status = statusRaw && statusRaw !== "ALL" ? statusRaw : null;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? "25") || 25));

  return {
    q,
    status,
    active: parseBoolish(searchParams.get("active")),
    suspended: parseBoolish(searchParams.get("suspended")),
    archived: parseBoolish(searchParams.get("archived")),
    page,
    pageSize,
  };
}

function statusWhere(params: ListRoleUsersParams) {
  if (params.status) return eq(users.status, params.status as any);

  const clauses = [] as any[];
  if (params.active === true) clauses.push(eq(users.status, "ACTIVE" as any));
  if (params.suspended === true) clauses.push(eq(users.status, "SUSPENDED" as any));
  if (params.archived === true) clauses.push(eq(users.status, "ARCHIVED" as any));
  if (clauses.length === 1) return clauses[0];
  if (clauses.length > 1) return or(...clauses);
  return undefined;
}

function mapRowToListRow(
  role: RoleScope,
  row: {
    id: string;
    email: string | null;
    phone: string | null;
    name: string | null;
    status: string;
    suspendedUntil: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
    stripeUpdatedAt?: Date | null;
    regionCode?: string | null;
    city?: string | null;
    country?: string | null;
    badges?: string[];
  },
): AdminUserListRow {
  return {
    id: row.id,
    role,
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country ?? null,
    regionCode: row.regionCode ?? null,
    city: row.city ?? null,
    status: String(row.status ?? "ACTIVE"),
    suspendedUntil: asIso(row.suspendedUntil),
    archivedAt: asIso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: asIso(row.stripeUpdatedAt),
    badges: row.badges ?? [],
  };
}

export async function listContractors(params: ListRoleUsersParams): Promise<AdminUsersListResult> {
  const where = [] as any[];
  where.push(eq(users.role, "CONTRACTOR" as any));
  const statusClause = statusWhere(params);
  if (statusClause) where.push(statusClause);

  if (params.q) {
    const pattern = `%${params.q}%`;
    where.push(
      or(
        ilike(users.email, pattern),
        ilike(users.name, pattern),
        ilike(contractorAccounts.businessName, pattern),
        ilike(contractorAccounts.city, pattern),
      ),
    );
  }

  const whereClause = and(...where);
  const offset = (params.page - 1) * params.pageSize;

  const [countRows, rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(users)
      .innerJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
      .where(whereClause),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        name: users.name,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
        archivedAt: users.archivedAt,
        createdAt: users.createdAt,
        country: contractorAccounts.country,
        regionCode: contractorAccounts.regionCode,
        city: contractorAccounts.city,
        businessName: contractorAccounts.businessName,
        approved: contractorAccounts.isApproved,
      })
      .from(users)
      .innerJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) =>
      mapRowToListRow("CONTRACTOR", {
        ...r,
        name: r.name ?? r.businessName ?? null,
        badges: [r.approved ? "APPROVED" : "PENDING_APPROVAL"],
      }),
    ),
    totalCount: Number(countRows[0]?.total ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listJobPosters(params: ListRoleUsersParams): Promise<AdminUsersListResult> {
  const where = [] as any[];
  where.push(eq(users.role, "JOB_POSTER" as any));
  const statusClause = statusWhere(params);
  if (statusClause) where.push(statusClause);

  if (params.q) {
    const pattern = `%${params.q}%`;
    where.push(
      or(
        ilike(users.email, pattern),
        ilike(users.name, pattern),
        ilike(jobPosters.defaultRegion, pattern),
      ),
    );
  }

  const whereClause = and(...where);
  const offset = (params.page - 1) * params.pageSize;

  const [countRows, rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(users)
      .innerJoin(jobPosters, eq(jobPosters.userId, users.id))
      .where(whereClause),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        name: users.name,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
        archivedAt: users.archivedAt,
        createdAt: users.createdAt,
        country: users.country,
        regionCode: jobPosters.defaultRegion,
        city: sql<string | null>`null`,
        totalJobsPosted: jobPosters.totalJobsPosted,
      })
      .from(users)
      .innerJoin(jobPosters, eq(jobPosters.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) =>
      mapRowToListRow("JOB_POSTER", {
        ...r,
        badges: [`JOBS:${Number(r.totalJobsPosted ?? 0)}`],
      }),
    ),
    totalCount: Number(countRows[0]?.total ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listRouters(params: ListRoleUsersParams): Promise<AdminUsersListResult> {
  const where = [] as any[];
  where.push(eq(users.role, "ROUTER" as any));
  const statusClause = statusWhere(params);
  if (statusClause) where.push(statusClause);

  if (params.q) {
    const pattern = `%${params.q}%`;
    where.push(
      or(
        ilike(users.email, pattern),
        ilike(users.name, pattern),
        ilike(routers.homeRegionCode, pattern),
        ilike(routers.homeCity, pattern),
      ),
    );
  }

  const whereClause = and(...where);
  const offset = (params.page - 1) * params.pageSize;

  const [countRows, rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(users)
      .innerJoin(routers, eq(routers.userId, users.id))
      .where(whereClause),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        name: users.name,
        status: users.status,
        suspendedUntil: users.suspendedUntil,
        archivedAt: users.archivedAt,
        createdAt: users.createdAt,
        country: routers.homeCountry,
        regionCode: routers.homeRegionCode,
        city: routers.homeCity,
        isSeniorRouter: routers.isSeniorRouter,
      })
      .from(users)
      .innerJoin(routers, eq(routers.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) =>
      mapRowToListRow("ROUTER", {
        ...r,
        badges: [r.isSeniorRouter ? "SENIOR" : "ROUTER"],
      }),
    ),
    totalCount: Number(countRows[0]?.total ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

function deriveJobDisplayStatus(statusRaw: string, isMock: boolean, routerApprovedAt: Date | null): string {
  if (isMock) return "IN_PROGRESS";
  if (statusRaw === "CUSTOMER_APPROVED" && !routerApprovedAt) return "CUSTOMER_APPROVED_AWAITING_ROUTER";
  return statusRaw;
}

async function recentJobsForContractor(userId: string): Promise<AdminUserJobRef[]> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      isMock: jobs.is_mock,
      routerApprovedAt: jobs.router_approved_at,
      createdAt: jobs.created_at,
      updatedAt: jobs.updated_at,
      amountCents: jobs.amount_cents,
    })
    .from(jobs)
    .where(eq(jobs.contractor_user_id, userId))
    .orderBy(desc(jobs.updated_at))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    statusRaw: String(r.status ?? ""),
    displayStatus: deriveJobDisplayStatus(String(r.status ?? ""), Boolean(r.isMock), r.routerApprovedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    amountCents: Number(r.amountCents ?? 0),
  }));
}

async function recentJobsForJobPoster(userId: string): Promise<AdminUserJobRef[]> {
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      isMock: jobs.is_mock,
      routerApprovedAt: jobs.router_approved_at,
      createdAt: jobs.created_at,
      updatedAt: jobs.updated_at,
      amountCents: jobs.amount_cents,
    })
    .from(jobs)
    .where(eq(jobs.job_poster_user_id, userId))
    .orderBy(desc(jobs.updated_at))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    statusRaw: String(r.status ?? ""),
    displayStatus: deriveJobDisplayStatus(String(r.status ?? ""), Boolean(r.isMock), r.routerApprovedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    amountCents: Number(r.amountCents ?? 0),
  }));
}

async function recentJobsForRouter(userId: string): Promise<AdminUserJobRef[]> {
  const dispatchRows = await db
    .select({
      jobId: jobDispatches.jobId,
      createdAt: jobDispatches.createdAt,
      title: jobs.title,
      status: jobs.status,
      isMock: jobs.is_mock,
      routerApprovedAt: jobs.router_approved_at,
      jobCreatedAt: jobs.created_at,
      updatedAt: jobs.updated_at,
      amountCents: jobs.amount_cents,
    })
    .from(jobDispatches)
    .innerJoin(jobs, eq(jobs.id, jobDispatches.jobId))
    .where(eq(jobDispatches.routerUserId, userId))
    .orderBy(desc(jobDispatches.createdAt))
    .limit(80);

  const seen = new Set<string>();
  const out: AdminUserJobRef[] = [];
  for (const row of dispatchRows) {
    if (seen.has(row.jobId)) continue;
    seen.add(row.jobId);
    out.push({
      id: row.jobId,
      title: row.title,
      statusRaw: String(row.status ?? ""),
      displayStatus: deriveJobDisplayStatus(String(row.status ?? ""), Boolean(row.isMock), row.routerApprovedAt),
      createdAt: row.jobCreatedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      amountCents: Number(row.amountCents ?? 0),
    });
    if (out.length >= 20) break;
  }
  return out;
}

async function payoutReadinessForUser(userId: string, status: string, stripeConnected: boolean): Promise<AdminPayoutReadiness> {
  const methods = await db
    .select({ id: payoutMethods.id })
    .from(payoutMethods)
    .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.isActive, true)))
    .limit(1);

  const hasPayoutMethod = Boolean(methods[0]?.id);
  const blockers: string[] = [];
  if (!hasPayoutMethod) blockers.push("NO_PAYOUT_METHOD");
  if (!stripeConnected) blockers.push("STRIPE_NOT_CONNECTED");
  if (status !== "ACTIVE") blockers.push(`ACCOUNT_${status}`);

  return {
    hasPayoutMethod,
    stripeConnected,
    eligible: blockers.length === 0,
    blockers,
  };
}

async function enforcementForUser(userId: string, includeStrikes: boolean) {
  const [flagRows, strikeRows] = await Promise.all([
    db
      .select({ total: count() })
      .from(internalAccountFlags)
      .where(and(eq(internalAccountFlags.userId, userId), or(eq(internalAccountFlags.status, "ACTIVE"), isNotNull(internalAccountFlags.id)))),
    includeStrikes
      ? db.select({ total: count() }).from(v4ContractorStrikes).where(eq(v4ContractorStrikes.contractorUserId, userId))
      : Promise.resolve([{ total: 0 }]),
  ]);

  return {
    flags: Number(flagRows[0]?.total ?? 0),
    strikes: includeStrikes ? Number(strikeRows[0]?.total ?? 0) : undefined,
  };
}

function accountStatusFromUser(user: {
  status: string;
  suspendedUntil: Date | null;
  suspensionReason: string | null;
  archivedAt: Date | null;
  archivedReason: string | null;
  stripeUpdatedAt: Date | null;
}): AdminAccountStatus {
  return {
    status: String(user.status ?? "ACTIVE"),
    suspendedUntil: asIso(user.suspendedUntil),
    suspensionReason: user.suspensionReason ?? null,
    archivedAt: asIso(user.archivedAt),
    archivedReason: user.archivedReason ?? null,
    disabled: user.status === "ARCHIVED",
    lastLoginAt: asIso(user.stripeUpdatedAt),
  };
}

export async function getContractorDetail(userId: string): Promise<AdminRoleDetail | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      name: users.name,
      status: users.status,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
      archivedAt: users.archivedAt,
      archivedReason: users.archivedReason,
      stripeUpdatedAt: users.stripeUpdatedAt,
      country: contractorAccounts.country,
      regionCode: contractorAccounts.regionCode,
      city: contractorAccounts.city,
      firstName: contractorAccounts.firstName,
      lastName: contractorAccounts.lastName,
      businessName: contractorAccounts.businessName,
      tradeCategory: contractorAccounts.tradeCategory,
      serviceRadiusKm: contractorAccounts.serviceRadiusKm,
      approved: contractorAccounts.isApproved,
      wizardCompleted: contractorAccounts.wizardCompleted,
      payoutStatus: contractorAccounts.payoutStatus,
      stripeAccountId: contractorAccounts.stripeAccountId,
    })
    .from(users)
    .innerJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;

  const fallbackName =
    [String(row.firstName ?? "").trim(), String(row.lastName ?? "").trim()].filter(Boolean).join(" ") || row.businessName || null;
  const name = row.name ?? fallbackName;

  const stripeConnected = Boolean(row.stripeAccountId);
  const [recentJobs, payoutReadiness, enforcement] = await Promise.all([
    recentJobsForContractor(userId),
    payoutReadinessForUser(userId, String(row.status ?? "ACTIVE"), stripeConnected),
    enforcementForUser(userId, true),
  ]);

  const profile: AdminUserProfile = {
    id: row.id,
    role: "CONTRACTOR",
    name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    regionCode: row.regionCode,
    city: row.city,
    serviceRegion: [row.city, row.regionCode, row.country].filter(Boolean).join(", ") || null,
    verification: {
      termsAccepted: row.wizardCompleted,
      profileComplete: row.wizardCompleted,
      approved: row.approved,
    },
    paymentSetup: {
      hasPayoutMethod: payoutReadiness.hasPayoutMethod,
      stripeConnected,
      payoutStatus: row.payoutStatus ?? null,
    },
    metadata: {
      businessName: row.businessName,
      tradeCategory: row.tradeCategory,
      serviceRadiusKm: row.serviceRadiusKm,
    },
  };

  return {
    profile,
    accountStatus: accountStatusFromUser(row),
    recentJobs,
    payoutReadiness,
    enforcement: {
      strikes: enforcement.strikes,
      flags: enforcement.flags,
      suspendedUntil: asIso(row.suspendedUntil),
      archivedAt: asIso(row.archivedAt),
    },
  };
}

export async function getJobPosterDetail(userId: string): Promise<AdminRoleDetail | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      name: users.name,
      status: users.status,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
      archivedAt: users.archivedAt,
      archivedReason: users.archivedReason,
      stripeUpdatedAt: users.stripeUpdatedAt,
      stripeStatus: users.stripeStatus,
      stripeCustomerId: users.stripeCustomerId,
      country: users.country,
      stateCode: users.stateCode,
      city: users.legalCity,
      totalJobsPosted: jobPosters.totalJobsPosted,
      defaultRegion: jobPosters.defaultRegion,
      isActive: jobPosters.isActive,
      lastJobPostedAt: jobPosters.lastJobPostedAt,
    })
    .from(users)
    .innerJoin(jobPosters, eq(jobPosters.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;

  const stripeConnected = Boolean(row.stripeCustomerId || row.stripeStatus === "ACTIVE");
  const [recentJobs, payoutReadiness, enforcement] = await Promise.all([
    recentJobsForJobPoster(userId),
    payoutReadinessForUser(userId, String(row.status ?? "ACTIVE"), stripeConnected),
    enforcementForUser(userId, false),
  ]);

  const profile: AdminUserProfile = {
    id: row.id,
    role: "JOB_POSTER",
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    regionCode: row.stateCode,
    city: row.city,
    serviceRegion: [row.city, row.defaultRegion, row.country].filter(Boolean).join(", ") || null,
    verification: {
      termsAccepted: true,
      profileComplete: true,
      approved: row.isActive,
    },
    paymentSetup: {
      hasPayoutMethod: payoutReadiness.hasPayoutMethod,
      stripeConnected,
      payoutStatus: row.stripeStatus ?? null,
    },
    metadata: {
      totalJobsPosted: row.totalJobsPosted,
      defaultRegion: row.defaultRegion,
      lastJobPostedAt: asIso(row.lastJobPostedAt),
    },
  };

  return {
    profile,
    accountStatus: accountStatusFromUser(row),
    recentJobs,
    payoutReadiness,
    enforcement: {
      flags: enforcement.flags,
      suspendedUntil: asIso(row.suspendedUntil),
      archivedAt: asIso(row.archivedAt),
    },
  };
}

export async function getRouterDetail(userId: string): Promise<AdminRoleDetail | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      name: users.name,
      status: users.status,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
      archivedAt: users.archivedAt,
      archivedReason: users.archivedReason,
      stripeUpdatedAt: users.stripeUpdatedAt,
      country: routers.homeCountry,
      regionCode: routers.homeRegionCode,
      city: routers.homeCity,
      termsAccepted: routers.termsAccepted,
      profileComplete: routers.profileComplete,
      statusRouter: routers.status,
      dailyRouteLimit: routers.dailyRouteLimit,
      routesCompleted: routers.routesCompleted,
      routesFailed: routers.routesFailed,
      isSeniorRouter: routers.isSeniorRouter,
    })
    .from(users)
    .innerJoin(routers, eq(routers.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;

  const stripeConnected = false;
  const [recentJobs, payoutReadiness, enforcement] = await Promise.all([
    recentJobsForRouter(userId),
    payoutReadinessForUser(userId, String(row.status ?? "ACTIVE"), stripeConnected),
    enforcementForUser(userId, false),
  ]);

  const profile: AdminUserProfile = {
    id: row.id,
    role: "ROUTER",
    name: row.name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    regionCode: row.regionCode,
    city: row.city,
    serviceRegion: [row.city, row.regionCode, row.country].filter(Boolean).join(", ") || null,
    verification: {
      termsAccepted: row.termsAccepted,
      profileComplete: row.profileComplete,
      approved: row.statusRouter === "ACTIVE",
    },
    paymentSetup: {
      hasPayoutMethod: payoutReadiness.hasPayoutMethod,
      stripeConnected,
      payoutStatus: null,
    },
    metadata: {
      dailyRouteLimit: row.dailyRouteLimit,
      routesCompleted: row.routesCompleted,
      routesFailed: row.routesFailed,
      isSeniorRouter: row.isSeniorRouter,
      routerStatus: row.statusRouter,
    },
  };

  return {
    profile,
    accountStatus: accountStatusFromUser(row),
    recentJobs,
    payoutReadiness,
    enforcement: {
      flags: enforcement.flags,
      suspendedUntil: asIso(row.suspendedUntil),
      archivedAt: asIso(row.archivedAt),
    },
  };
}

export async function contractorActivationMetrics(): Promise<{ total: number; active: number }> {
  const rows = await db
    .select({
      total: count(),
      active: count(sql`case when ${users.status} = 'ACTIVE' then 1 end`),
    })
    .from(users)
    .where(eq(users.role, "CONTRACTOR" as any));

  return {
    total: Number(rows[0]?.total ?? 0),
    active: Number(rows[0]?.active ?? 0),
  };
}
