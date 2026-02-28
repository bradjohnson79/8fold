import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { jobPosterProfilesV4, jobPosters, users } from "@/db/schema";
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

type JobPosterProfileFallback = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  city: string | null;
  provinceState: string | null;
  country: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

function joinName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const joined = [String(firstName ?? "").trim(), String(lastName ?? "").trim()].filter(Boolean).join(" ").trim();
  return joined || null;
}

function stripeBadge(stripeConnected: boolean, stripeVerified: boolean): string {
  if (stripeVerified) return "STRIPE_VERIFIED";
  if (stripeConnected) return "STRIPE_CONNECTED_PENDING_PAYMENT_METHOD";
  return "STRIPE_NOT_CONNECTED";
}

async function loadJobPosterProfileFallbacks(
  userIds: string[],
  hasProfiles: boolean,
): Promise<Map<string, JobPosterProfileFallback>> {
  if (!hasProfiles || userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: jobPosterProfilesV4.userId,
      firstName: jobPosterProfilesV4.firstName,
      lastName: jobPosterProfilesV4.lastName,
      email: jobPosterProfilesV4.email,
      city: jobPosterProfilesV4.city,
      provinceState: jobPosterProfilesV4.provinceState,
      country: jobPosterProfilesV4.country,
      formattedAddress: jobPosterProfilesV4.formattedAddress,
      latitude: jobPosterProfilesV4.latitude,
      longitude: jobPosterProfilesV4.longitude,
      updatedAt: jobPosterProfilesV4.updatedAt,
    })
    .from(jobPosterProfilesV4)
    .where(inArray(jobPosterProfilesV4.userId, userIds as any))
    .orderBy(desc(jobPosterProfilesV4.updatedAt));

  const out = new Map<string, JobPosterProfileFallback>();
  for (const row of rows) {
    if (!out.has(row.userId)) {
      out.set(row.userId, {
        userId: row.userId,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        email: row.email ?? null,
        city: row.city ?? null,
        provinceState: row.provinceState ?? null,
        country: row.country ?? null,
        formattedAddress: row.formattedAddress ?? null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
      });
    }
  }
  return out;
}

export async function list(params: RoleListParams) {
  const offset = (params.page - 1) * params.pageSize;
  const [hasJobPostersTable, hasProfilesV4] = await Promise.all([
    tableExists("job_posters"),
    tableExists("job_poster_profiles_v4"),
  ]);

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
          city: users.legalCity,
          stripeStatus: users.stripeStatus,
          stripeCustomerId: users.stripeCustomerId,
          stripeDefaultPaymentMethodId: users.stripeDefaultPaymentMethodId,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(params.pageSize)
        .offset(offset),
    ]);

    const profileMap = await loadJobPosterProfileFallbacks(
      rows.map((r) => r.id),
      hasProfilesV4,
    );

    return {
      rows: rows.map((r) => {
        const profile = profileMap.get(r.id);
        const profileName = joinName(profile?.firstName, profile?.lastName);
        const name = r.name ?? profileName ?? null;
        const email = r.email ?? profile?.email ?? null;
        const city = r.city ?? profile?.city ?? null;
        const regionCode = r.regionCode ?? profile?.provinceState ?? null;
        const country = r.country ?? profile?.country ?? null;
        const stripeConnected = Boolean(r.stripeCustomerId || r.stripeDefaultPaymentMethodId);
        const stripeVerified = stripeConnected && ["CONNECTED", "ACTIVE"].includes(String(r.stripeStatus ?? "").toUpperCase());
        return {
          ...r,
          name,
          email,
          city,
          country,
          regionCode,
          createdAt: r.createdAt.toISOString(),
          suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
          archivedAt: r.archivedAt?.toISOString() ?? null,
          role: "JOB_POSTER",
          latitude: profile?.latitude ?? null,
          longitude: profile?.longitude ?? null,
          formattedAddress: profile?.formattedAddress ?? null,
          badges: [
            stripeBadge(stripeConnected, stripeVerified),
            profile ? "PROFILE_V4_ONLY" : "PROFILE_MISSING",
          ],
        };
      }),
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
        city: users.legalCity,
        regionCode: jobPosters.defaultRegion,
        totalJobsPosted: jobPosters.totalJobsPosted,
        profileUserId: jobPosters.userId,
        stripeStatus: users.stripeStatus,
        stripeCustomerId: users.stripeCustomerId,
        stripeDefaultPaymentMethodId: users.stripeDefaultPaymentMethodId,
      })
      .from(users)
      .leftJoin(jobPosters, eq(jobPosters.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  const profileMap = await loadJobPosterProfileFallbacks(
    rows.map((r) => r.id),
    hasProfilesV4,
  );

  return {
    rows: rows.map((r) => ({
      ...r,
      name: r.name ?? joinName(profileMap.get(r.id)?.firstName, profileMap.get(r.id)?.lastName) ?? null,
      email: r.email ?? profileMap.get(r.id)?.email ?? null,
      city: r.city ?? profileMap.get(r.id)?.city ?? null,
      country: r.country ?? profileMap.get(r.id)?.country ?? null,
      regionCode: r.regionCode ?? profileMap.get(r.id)?.provinceState ?? null,
      createdAt: r.createdAt.toISOString(),
      suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      role: "JOB_POSTER",
      latitude: profileMap.get(r.id)?.latitude ?? null,
      longitude: profileMap.get(r.id)?.longitude ?? null,
      formattedAddress: profileMap.get(r.id)?.formattedAddress ?? null,
      badges: [
        typeof r.totalJobsPosted === "number" ? `JOBS:${r.totalJobsPosted}` : "JOBS:0",
        stripeBadge(
          Boolean(r.stripeCustomerId || r.stripeDefaultPaymentMethodId),
          Boolean(r.stripeDefaultPaymentMethodId) && ["CONNECTED", "ACTIVE"].includes(String(r.stripeStatus ?? "").toUpperCase()),
        ),
        r.profileUserId
          ? profileMap.has(r.id)
            ? "PROFILE_SYNCED"
            : "PROFILE_CANONICAL_ONLY"
          : profileMap.has(r.id)
            ? "PROFILE_V4_ONLY"
            : "PROFILE_MISSING",
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
