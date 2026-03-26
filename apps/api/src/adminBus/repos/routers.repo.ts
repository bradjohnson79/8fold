import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { contractorAccounts, payoutMethods, routerProfilesV4, routers, users } from "@/db/schema";
import { tableExists } from "@/src/adminBus/schemaIntrospection";
import { parseRoleListParams, type RoleListParams } from "@/src/adminBus/repos/jobPosters.repo";

export { parseRoleListParams };

type RouterProfileFallback = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  contactName: string | null;
  homeRegion: string | null;
  homeCountryCode: string | null;
  homeRegionCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

type StripeMethodFallback = {
  userId: string;
  stripeAccountId: string | null;
  stripePayoutsEnabled: boolean;
};

function joinName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const joined = [String(firstName ?? "").trim(), String(lastName ?? "").trim()].filter(Boolean).join(" ").trim();
  return joined || null;
}

function stripeBadge(stripeConnected: boolean, stripeVerified: boolean): string {
  if (stripeVerified) return "STRIPE_VERIFIED";
  if (stripeConnected) return "STRIPE_CONNECTED_PENDING_VERIFICATION";
  return "STRIPE_NOT_CONNECTED";
}

async function loadRouterProfileFallbacks(
  userIds: string[],
  hasProfiles: boolean,
): Promise<Map<string, RouterProfileFallback>> {
  if (!hasProfiles || userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: routerProfilesV4.userId,
      firstName: routerProfilesV4.firstName,
      lastName: routerProfilesV4.lastName,
      email: routerProfilesV4.email,
      contactName: routerProfilesV4.contactName,
      homeRegion: routerProfilesV4.homeRegion,
      homeCountryCode: routerProfilesV4.homeCountryCode,
      homeRegionCode: routerProfilesV4.homeRegionCode,
      latitude: routerProfilesV4.homeLatitude,
      longitude: routerProfilesV4.homeLongitude,
      updatedAt: routerProfilesV4.updatedAt,
    })
    .from(routerProfilesV4)
    .where(inArray(routerProfilesV4.userId, userIds as any))
    .orderBy(desc(routerProfilesV4.updatedAt));

  const out = new Map<string, RouterProfileFallback>();
  for (const row of rows) {
    if (!out.has(row.userId)) {
      out.set(row.userId, {
        userId: row.userId,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        email: row.email ?? null,
        contactName: row.contactName ?? null,
        homeRegion: row.homeRegion ?? null,
        homeCountryCode: row.homeCountryCode ?? null,
        homeRegionCode: row.homeRegionCode ?? null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
      });
    }
  }
  return out;
}

async function loadStripeMethodFallbacks(
  userIds: string[],
  hasPayoutMethods: boolean,
): Promise<Map<string, StripeMethodFallback>> {
  if (userIds.length === 0) return new Map();

  const out = new Map<string, StripeMethodFallback>();

  if (hasPayoutMethods) {
    const rows = await db
      .select({
        userId: payoutMethods.userId,
        stripeAccountId: sql<string | null>`${payoutMethods.details} ->> 'stripeAccountId'`,
        stripePayoutsEnabled: sql<boolean>`case
          when lower(coalesce(${payoutMethods.details} ->> 'stripePayoutsEnabled', 'false')) in ('true','t','1','yes') then true
          else false
        end`,
        createdAt: payoutMethods.createdAt,
      })
      .from(payoutMethods)
      .where(
        and(
          inArray(payoutMethods.userId, userIds as any),
          eq(payoutMethods.provider, "STRIPE" as any),
          eq(payoutMethods.isActive, true),
        ),
      )
      .orderBy(desc(payoutMethods.createdAt));

    for (const row of rows) {
      if (!out.has(row.userId)) {
        out.set(row.userId, {
          userId: row.userId,
          stripeAccountId: row.stripeAccountId ? String(row.stripeAccountId).trim() : null,
          stripePayoutsEnabled: Boolean(row.stripePayoutsEnabled),
        });
      }
    }
  }

  const missingIds = userIds.filter((id) => !out.has(id));
  if (missingIds.length > 0) {
    try {
      const caRows = await db
        .select({ userId: contractorAccounts.userId, stripeAccountId: contractorAccounts.stripeAccountId })
        .from(contractorAccounts)
        .where(inArray(contractorAccounts.userId, missingIds as any));
      for (const row of caRows) {
        const acctId = String(row.stripeAccountId ?? "").trim();
        if (acctId && !out.has(row.userId)) {
          out.set(row.userId, {
            userId: row.userId,
            stripeAccountId: acctId,
            stripePayoutsEnabled: false,
          });
        }
      }
    } catch {
      // contractor_accounts may not exist; safe to ignore
    }
  }

  return out;
}

export async function list(params: RoleListParams) {
  const offset = (params.page - 1) * params.pageSize;
  const [hasRouters, hasProfilesV4, hasPayoutMethods] = await Promise.all([
    tableExists("routers"),
    tableExists("router_profiles_v4"),
    tableExists("PayoutMethod"),
  ]);

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
          city: users.legalCity,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(params.pageSize)
        .offset(offset),
    ]);

    const [profileMap, stripeMap] = await Promise.all([
      loadRouterProfileFallbacks(rows.map((r) => r.id), hasProfilesV4),
      loadStripeMethodFallbacks(rows.map((r) => r.id), hasPayoutMethods),
    ]);

    return {
      rows: rows.map((r) => {
        const profile = profileMap.get(r.id);
        const stripe = stripeMap.get(r.id);
      const stripeConnected = Boolean(stripe?.stripeAccountId);
      const stripeVerified = Boolean(stripe?.stripePayoutsEnabled);
      return {
        ...r,
        name: r.name ?? profile?.contactName ?? joinName(profile?.firstName, profile?.lastName) ?? null,
        email: r.email ?? profile?.email ?? null,
        country: r.country ?? profile?.homeCountryCode ?? null,
        regionCode: r.regionCode ?? profile?.homeRegionCode ?? null,
        city: r.city ?? profile?.homeRegion ?? null,
        createdAt: r.createdAt.toISOString(),
        suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        role: "ROUTER",
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
        badges: [stripeBadge(stripeConnected, stripeVerified), profile ? "PROFILE_V4_ONLY" : "PROFILE_MISSING"],
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
        userCountry: users.country,
        userRegionCode: users.stateCode,
        userCity: users.legalCity,
        country: routers.homeCountry,
        regionCode: routers.homeRegionCode,
        city: routers.homeCity,
        isSeniorRouter: routers.isSeniorRouter,
        routerUserId: routers.userId,
      })
      .from(users)
      .leftJoin(routers, eq(routers.userId, users.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  const [profileMap, stripeMap] = await Promise.all([
    loadRouterProfileFallbacks(rows.map((r) => r.id), hasProfilesV4),
    loadStripeMethodFallbacks(rows.map((r) => r.id), hasPayoutMethods),
  ]);

  return {
    rows: rows.map((r) => {
      const profile = profileMap.get(r.id);
      const stripe = stripeMap.get(r.id);
      const stripeConnected = Boolean(stripe?.stripeAccountId);
      const stripeVerified = Boolean(stripe?.stripePayoutsEnabled);
      return {
        ...r,
        name: r.name ?? profile?.contactName ?? joinName(profile?.firstName, profile?.lastName) ?? null,
        email: r.email ?? profile?.email ?? null,
        country: r.country ?? profile?.homeCountryCode ?? r.userCountry ?? null,
        regionCode: r.regionCode ?? profile?.homeRegionCode ?? r.userRegionCode ?? null,
        city: r.city ?? profile?.homeRegion ?? r.userCity ?? null,
        createdAt: r.createdAt.toISOString(),
        suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        role: "ROUTER",
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
        badges: [
          r.isSeniorRouter ? "SENIOR" : "ROUTER",
          stripeBadge(stripeConnected, stripeVerified),
          r.routerUserId
            ? profile
              ? "PROFILE_SYNCED"
              : "PROFILE_CANONICAL_ONLY"
            : profile
              ? "PROFILE_V4_ONLY"
              : "PROFILE_MISSING",
        ],
      };
    }),
    totalCount: Number(countRows[0]?.total ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export const routersRepo = {
  parseRoleListParams,
  list,
};
