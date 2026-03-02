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
  contractorProfilesV4,
  conversations,
  internalAccountFlags,
  jobAssignments,
  jobPosterProfilesV4,
  jobPosters,
  jobs,
  payoutMethods,
  routerProfilesV4,
  routers,
  scoreAppraisals,
  aiEnforcementEvents,
  disputes,
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

function deriveJobDisplayStatus(statusRaw: string, isMock: boolean, _routerApprovedAt: Date | null): string {
  if (isMock) return "IN_PROGRESS";
  if (statusRaw === "OPEN_FOR_ROUTING") return "CUSTOMER_APPROVED_AWAITING_ROUTER";
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
  const isMissingRelation = (error: unknown): boolean => {
    const cause = (error as any)?.cause;
    const code = String((error as any)?.code ?? cause?.code ?? "");
    if (code === "42P01") return true;
    const message = String((error as any)?.message ?? cause?.message ?? "");
    return message.includes("does not exist");
  };

  let flags = 0;
  try {
    const flagRows = await db
      .select({ total: count() })
      .from(internalAccountFlags)
      .where(
        and(
          eq(internalAccountFlags.userId, userId),
          or(eq(internalAccountFlags.status, "ACTIVE"), isNotNull(internalAccountFlags.id)),
        ),
      );
    flags = Number(flagRows[0]?.total ?? 0);
  } catch (error) {
    if (!isMissingRelation(error)) throw error;
  }

  let strikes: number | undefined = undefined;
  if (includeStrikes) {
    try {
      const strikeRows = await db
        .select({ total: count() })
        .from(v4ContractorStrikes)
        .where(eq(v4ContractorStrikes.contractorUserId, userId));
      strikes = Number(strikeRows[0]?.total ?? 0);
    } catch (error) {
      if (!isMissingRelation(error)) throw error;
      strikes = 0;
    }
  }

  return { flags, strikes };
}

async function scoreAppraisalForUser(userId: string, role: "CONTRACTOR" | "POSTER") {
  const rows = await db
    .select({
      jobsEvaluated: scoreAppraisals.jobsEvaluated,
      avgPunctuality: scoreAppraisals.avgPunctuality,
      avgCommunication: scoreAppraisals.avgCommunication,
      avgQuality: scoreAppraisals.avgQuality,
      avgCooperation: scoreAppraisals.avgCooperation,
      totalScore: scoreAppraisals.totalScore,
      version: scoreAppraisals.version,
      updatedAt: scoreAppraisals.updatedAt,
    })
    .from(scoreAppraisals)
    .where(and(eq(scoreAppraisals.userId, userId), eq(scoreAppraisals.role, role)))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row || Number(row.jobsEvaluated ?? 0) < 3 || row.totalScore == null) {
    return {
      pending: true,
      jobsEvaluated: Number(row?.jobsEvaluated ?? 0),
      minimumRequired: 3,
    };
  }

  return {
    pending: false,
    jobsEvaluated: Number(row.jobsEvaluated ?? 0),
    minimumRequired: 3,
    appraisal: {
      avgPunctuality: row.avgPunctuality ?? null,
      avgCommunication: row.avgCommunication ?? null,
      avgQuality: row.avgQuality ?? null,
      avgCooperation: row.avgCooperation ?? null,
      totalScore: row.totalScore ?? null,
    },
    version: row.version,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
  };
}

async function aiEnforcementForUser(userId: string) {
  const [eventRows, disputeRows] = await Promise.all([
    db
      .select({
        total: count(),
        latestActionTaken: sql<string | null>`max(${aiEnforcementEvents.actionTaken})`,
      })
      .from(aiEnforcementEvents)
      .where(eq(aiEnforcementEvents.userId, userId)),
    db
      .select({ total: count() })
      .from(disputes)
      .where(eq(disputes.userId, userId)),
  ]);

  return {
    events: Number(eventRows[0]?.total ?? 0),
    disputes: Number(disputeRows[0]?.total ?? 0),
    latestActionTaken: eventRows[0]?.latestActionTaken ?? null,
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

async function getLatestStripeMethod(userId: string): Promise<{ stripeAccountId: string | null; payoutsEnabled: boolean } | null> {
  const rows = await db
    .select({
      stripeAccountId: sql<string | null>`${payoutMethods.details} ->> 'stripeAccountId'`,
      payoutsEnabled: sql<boolean>`case
        when lower(coalesce(${payoutMethods.details} ->> 'stripePayoutsEnabled', 'false')) in ('true','t','1','yes') then true
        else false
      end`,
    })
    .from(payoutMethods)
    .where(and(eq(payoutMethods.userId, userId), eq(payoutMethods.provider, "STRIPE" as any), eq(payoutMethods.isActive, true)))
    .orderBy(desc(payoutMethods.createdAt))
    .limit(1);
  const row = rows[0] ?? null;
  if (!row) return null;
  return {
    stripeAccountId: row.stripeAccountId ? String(row.stripeAccountId).trim() : null,
    payoutsEnabled: Boolean(row.payoutsEnabled),
  };
}

export async function getContractorDetail(userId: string): Promise<AdminRoleDetail | null> {
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      phone: users.phone,
      name: users.name,
      status: users.status,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
      archivedAt: users.archivedAt,
      archivedReason: users.archivedReason,
      stripeUpdatedAt: users.stripeUpdatedAt,
      userCountry: users.country,
      userRegionCode: users.stateCode,
      userCity: users.legalCity,
      userFormattedAddress: users.formattedAddress,
      userLatitude: users.latitude,
      userLongitude: users.longitude,
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
      waiverAccepted: contractorAccounts.waiverAccepted,
      payoutStatus: contractorAccounts.payoutStatus,
      stripeAccountId: contractorAccounts.stripeAccountId,
      profileContactName: contractorProfilesV4.contactName,
      profileEmail: contractorProfilesV4.email,
      profileBusinessName: contractorProfilesV4.businessName,
      profileCity: contractorProfilesV4.city,
      profileCountryCode: contractorProfilesV4.countryCode,
      profileFormattedAddress: contractorProfilesV4.formattedAddress,
      profileLatitude: contractorProfilesV4.homeLatitude,
      profileLongitude: contractorProfilesV4.homeLongitude,
      profileTradeCategories: contractorProfilesV4.tradeCategories,
      profileServiceRadiusKm: contractorProfilesV4.serviceRadiusKm,
      profileAcceptedTosAt: contractorProfilesV4.acceptedTosAt,
    })
    .from(users)
    .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
    .leftJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;
  if (String(row.role ?? "").toUpperCase() !== "CONTRACTOR") return null;

  const fallbackName =
    [String(row.firstName ?? "").trim(), String(row.lastName ?? "").trim()].filter(Boolean).join(" ") ||
    String(row.profileContactName ?? "").trim() ||
    row.businessName ||
    row.profileBusinessName ||
    null;
  const name = row.name ?? fallbackName;

  const stripeMethod = await getLatestStripeMethod(userId);
  const stripeConnected = Boolean(row.stripeAccountId || stripeMethod?.stripeAccountId);
  const stripeVerified =
    Boolean(stripeMethod?.payoutsEnabled) ||
    ["ACTIVE", "VERIFIED", "READY"].includes(String(row.payoutStatus ?? "").toUpperCase());

  const [recentJobs, payoutReadiness, enforcement, scoreAppraisal, aiEnforcement] = await Promise.all([
    recentJobsForContractor(userId),
    payoutReadinessForUser(userId, String(row.status ?? "ACTIVE"), stripeConnected),
    enforcementForUser(userId, true),
    scoreAppraisalForUser(userId, "CONTRACTOR"),
    aiEnforcementForUser(userId),
  ]);

  const profile: AdminUserProfile = {
    id: row.id,
    role: "CONTRACTOR",
    name,
    email: row.email ?? row.profileEmail,
    phone: row.phone,
    country: row.country ?? row.profileCountryCode ?? row.userCountry,
    regionCode: row.regionCode ?? row.userRegionCode,
    city: row.city ?? row.profileCity ?? row.userCity,
    serviceRegion: [row.city ?? row.profileCity ?? row.userCity, row.regionCode ?? row.userRegionCode, row.country ?? row.profileCountryCode ?? row.userCountry]
      .filter(Boolean)
      .join(", ") || null,
    verification: {
      termsAccepted: row.waiverAccepted ?? row.wizardCompleted ?? Boolean(row.profileAcceptedTosAt),
      profileComplete: row.wizardCompleted ?? Boolean(row.profileContactName),
      approved: row.approved,
    },
    paymentSetup: {
      hasPayoutMethod: payoutReadiness.hasPayoutMethod,
      stripeConnected,
      payoutStatus: stripeVerified ? "VERIFIED" : (row.payoutStatus ?? null),
    },
    metadata: {
      businessName: row.businessName ?? row.profileBusinessName,
      tradeCategory: row.tradeCategory ?? (Array.isArray(row.profileTradeCategories) ? String(row.profileTradeCategories[0] ?? "") || null : null),
      serviceRadiusKm: row.serviceRadiusKm ?? row.profileServiceRadiusKm,
      formattedAddress: row.profileFormattedAddress ?? row.userFormattedAddress ?? null,
      latitude: row.profileLatitude ?? row.userLatitude ?? null,
      longitude: row.profileLongitude ?? row.userLongitude ?? null,
    },
  };

  return {
    profile,
    accountStatus: accountStatusFromUser(row),
    recentJobs,
    payoutReadiness,
    scoreAppraisal,
    aiEnforcement,
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
      role: users.role,
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
      stripeDefaultPaymentMethodId: users.stripeDefaultPaymentMethodId,
      country: users.country,
      stateCode: users.stateCode,
      city: users.legalCity,
      userFormattedAddress: users.formattedAddress,
      userLatitude: users.latitude,
      userLongitude: users.longitude,
      totalJobsPosted: jobPosters.totalJobsPosted,
      defaultRegion: jobPosters.defaultRegion,
      isActive: jobPosters.isActive,
      lastJobPostedAt: jobPosters.lastJobPostedAt,
      profileFirstName: jobPosterProfilesV4.firstName,
      profileLastName: jobPosterProfilesV4.lastName,
      profileEmail: jobPosterProfilesV4.email,
      profileCity: jobPosterProfilesV4.city,
      profileRegionCode: jobPosterProfilesV4.provinceState,
      profileCountry: jobPosterProfilesV4.country,
      profileFormattedAddress: jobPosterProfilesV4.formattedAddress,
      profileLatitude: jobPosterProfilesV4.latitude,
      profileLongitude: jobPosterProfilesV4.longitude,
    })
    .from(users)
    .leftJoin(jobPosters, eq(jobPosters.userId, users.id))
    .leftJoin(jobPosterProfilesV4, eq(jobPosterProfilesV4.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;
  if (String(row.role ?? "").toUpperCase() !== "JOB_POSTER") return null;

  const profileName = [String(row.profileFirstName ?? "").trim(), String(row.profileLastName ?? "").trim()].filter(Boolean).join(" ").trim() || null;
  const stripeConnected = Boolean(row.stripeCustomerId || row.stripeDefaultPaymentMethodId);
  const stripeVerified =
    stripeConnected &&
    ["CONNECTED", "ACTIVE"].includes(String(row.stripeStatus ?? "").toUpperCase());
  const [recentJobs, payoutReadiness, enforcement, scoreAppraisal, aiEnforcement] = await Promise.all([
    recentJobsForJobPoster(userId),
    payoutReadinessForUser(userId, String(row.status ?? "ACTIVE"), stripeConnected),
    enforcementForUser(userId, false),
    scoreAppraisalForUser(userId, "POSTER"),
    aiEnforcementForUser(userId),
  ]);

  const profile: AdminUserProfile = {
    id: row.id,
    role: "JOB_POSTER",
    name: row.name ?? profileName,
    email: row.email ?? row.profileEmail,
    phone: row.phone,
    country: row.country ?? row.profileCountry,
    regionCode: row.stateCode ?? row.profileRegionCode,
    city: row.city ?? row.profileCity,
    serviceRegion: [row.city ?? row.profileCity, row.defaultRegion ?? row.profileRegionCode, row.country ?? row.profileCountry].filter(Boolean).join(", ") || null,
    verification: {
      termsAccepted: true,
      profileComplete: Boolean(row.profileCity || row.defaultRegion),
      approved: row.isActive ?? true,
    },
    paymentSetup: {
      hasPayoutMethod: payoutReadiness.hasPayoutMethod,
      stripeConnected,
      payoutStatus: stripeVerified ? "VERIFIED" : (row.stripeStatus ?? null),
    },
    metadata: {
      totalJobsPosted: row.totalJobsPosted,
      defaultRegion: row.defaultRegion ?? row.profileRegionCode,
      lastJobPostedAt: asIso(row.lastJobPostedAt),
      formattedAddress: row.profileFormattedAddress ?? row.userFormattedAddress ?? null,
      latitude: row.profileLatitude ?? row.userLatitude ?? null,
      longitude: row.profileLongitude ?? row.userLongitude ?? null,
    },
  };

  return {
    profile,
    accountStatus: accountStatusFromUser(row),
    recentJobs,
    payoutReadiness,
    scoreAppraisal,
    aiEnforcement,
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
      role: users.role,
      email: users.email,
      phone: users.phone,
      name: users.name,
      status: users.status,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
      archivedAt: users.archivedAt,
      archivedReason: users.archivedReason,
      stripeUpdatedAt: users.stripeUpdatedAt,
      userCountry: users.country,
      userRegionCode: users.stateCode,
      userCity: users.legalCity,
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
      profileFirstName: routerProfilesV4.firstName,
      profileLastName: routerProfilesV4.lastName,
      profileEmail: routerProfilesV4.email,
      profileContactName: routerProfilesV4.contactName,
      profileHomeRegion: routerProfilesV4.homeRegion,
      profileCountry: routerProfilesV4.homeCountryCode,
      profileRegionCode: routerProfilesV4.homeRegionCode,
      profileLatitude: routerProfilesV4.homeLatitude,
      profileLongitude: routerProfilesV4.homeLongitude,
      profileServiceAreas: routerProfilesV4.serviceAreas,
      profileAvailability: routerProfilesV4.availability,
    })
    .from(users)
    .leftJoin(routers, eq(routers.userId, users.id))
    .leftJoin(routerProfilesV4, eq(routerProfilesV4.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;
  if (String(row.role ?? "").toUpperCase() !== "ROUTER") return null;

  const profileName =
    [String(row.profileFirstName ?? "").trim(), String(row.profileLastName ?? "").trim()].filter(Boolean).join(" ").trim() ||
    String(row.profileContactName ?? "").trim() ||
    null;
  const stripeMethod = await getLatestStripeMethod(userId);
  const stripeConnected = Boolean(stripeMethod?.stripeAccountId);
  const stripeVerified = Boolean(stripeMethod?.payoutsEnabled);
  const [recentJobs, payoutReadiness, enforcement] = await Promise.all([
    recentJobsForRouter(userId),
    payoutReadinessForUser(userId, String(row.status ?? "ACTIVE"), stripeConnected),
    enforcementForUser(userId, false),
  ]);

  const profile: AdminUserProfile = {
    id: row.id,
    role: "ROUTER",
    name: row.name ?? profileName,
    email: row.email ?? row.profileEmail,
    phone: row.phone,
    country: row.country ?? row.profileCountry ?? row.userCountry,
    regionCode: row.regionCode ?? row.profileRegionCode ?? row.userRegionCode,
    city: row.city ?? row.profileHomeRegion ?? row.userCity,
    serviceRegion: [row.city ?? row.profileHomeRegion ?? row.userCity, row.regionCode ?? row.profileRegionCode ?? row.userRegionCode, row.country ?? row.profileCountry ?? row.userCountry].filter(Boolean).join(", ") || null,
    verification: {
      termsAccepted: row.termsAccepted ?? Boolean(row.profileContactName),
      profileComplete: row.profileComplete ?? Boolean(row.profileContactName),
      approved: (row.statusRouter ? row.statusRouter === "ACTIVE" : String(row.status ?? "").toUpperCase() === "ACTIVE"),
    },
    paymentSetup: {
      hasPayoutMethod: payoutReadiness.hasPayoutMethod,
      stripeConnected,
      payoutStatus: stripeVerified ? "VERIFIED" : null,
    },
    metadata: {
      dailyRouteLimit: row.dailyRouteLimit,
      routesCompleted: row.routesCompleted,
      routesFailed: row.routesFailed,
      isSeniorRouter: row.isSeniorRouter,
      routerStatus: row.statusRouter,
      latitude: row.profileLatitude ?? null,
      longitude: row.profileLongitude ?? null,
      serviceAreas: Array.isArray(row.profileServiceAreas) ? row.profileServiceAreas : [],
      availability: Array.isArray(row.profileAvailability) ? row.profileAvailability : [],
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
