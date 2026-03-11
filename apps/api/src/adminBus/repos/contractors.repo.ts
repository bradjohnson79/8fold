import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { contractorAccounts, contractorProfilesV4, contractors, payoutMethods, users } from "@/db/schema";
import { tableExists } from "@/src/adminBus/schemaIntrospection";
import { parseRoleListParams, type RoleListParams } from "@/src/adminBus/repos/jobPosters.repo";

export { parseRoleListParams };

type ContractorProfileFallback = {
  userId: string;
  contactName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  businessName: string | null;
  city: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
};

type StripeMethodFallback = {
  userId: string;
  stripeAccountId: string | null;
  stripePayoutsEnabled: boolean;
};

function pickName(parts: Array<string | null | undefined>): string | null {
  for (const part of parts) {
    const value = String(part ?? "").trim();
    if (value) return value;
  }
  return null;
}

function joinName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const joined = [String(firstName ?? "").trim(), String(lastName ?? "").trim()].filter(Boolean).join(" ").trim();
  return joined || null;
}

function stripeBadge(stripeConnected: boolean, stripeVerified: boolean): string {
  if (stripeVerified) return "STRIPE_VERIFIED";
  if (stripeConnected) return "STRIPE_CONNECTED_PENDING_VERIFICATION";
  return "STRIPE_NOT_CONNECTED";
}

async function loadContractorProfileFallbacks(
  userIds: string[],
  hasProfiles: boolean,
): Promise<Map<string, ContractorProfileFallback>> {
  if (!hasProfiles || userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: contractorProfilesV4.userId,
      contactName: contractorProfilesV4.contactName,
      firstName: contractorProfilesV4.firstName,
      lastName: contractorProfilesV4.lastName,
      email: contractorProfilesV4.email,
      businessName: contractorProfilesV4.businessName,
      city: contractorProfilesV4.city,
      countryCode: contractorProfilesV4.countryCode,
      latitude: contractorProfilesV4.homeLatitude,
      longitude: contractorProfilesV4.homeLongitude,
      formattedAddress: contractorProfilesV4.formattedAddress,
      updatedAt: contractorProfilesV4.updatedAt,
    })
    .from(contractorProfilesV4)
    .where(inArray(contractorProfilesV4.userId, userIds as any))
    .orderBy(desc(contractorProfilesV4.updatedAt));

  const out = new Map<string, ContractorProfileFallback>();
  for (const row of rows) {
    if (!out.has(row.userId)) {
      out.set(row.userId, {
        userId: row.userId,
        contactName: row.contactName ?? null,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        email: row.email ?? null,
        businessName: row.businessName ?? null,
        city: row.city ?? null,
        countryCode: row.countryCode ?? null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        formattedAddress: row.formattedAddress ?? null,
      });
    }
  }
  return out;
}

async function loadStripeMethodFallbacks(
  userIds: string[],
  hasPayoutMethods: boolean,
): Promise<Map<string, StripeMethodFallback>> {
  if (!hasPayoutMethods || userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: payoutMethods.userId,
      createdAt: payoutMethods.createdAt,
      stripeAccountId: sql<string | null>`${payoutMethods.details} ->> 'stripeAccountId'`,
      stripePayoutsEnabled: sql<boolean>`case
        when lower(coalesce(${payoutMethods.details} ->> 'stripePayoutsEnabled', 'false')) in ('true','t','1','yes') then true
        else false
      end`,
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

  const out = new Map<string, StripeMethodFallback>();
  for (const row of rows) {
    if (!out.has(row.userId)) {
      out.set(row.userId, {
        userId: row.userId,
        stripeAccountId: row.stripeAccountId ? String(row.stripeAccountId).trim() : null,
        stripePayoutsEnabled: Boolean(row.stripePayoutsEnabled),
      });
    }
  }
  return out;
}

export async function list(params: RoleListParams) {
  const offset = (params.page - 1) * params.pageSize;
  const [hasAccounts, hasContractors, hasProfilesV4, hasPayoutMethods] = await Promise.all([
    tableExists("contractor_accounts"),
    tableExists("Contractor"),
    tableExists("contractor_profiles_v4"),
    tableExists("PayoutMethod"),
  ]);

  const where = [eq(users.role, "CONTRACTOR" as any)] as any[];
  if (params.status) where.push(eq(users.status, params.status as any));
  if (params.q) {
    const pat = `%${params.q}%`;
    where.push(
      hasAccounts
        ? sql`(${users.email} ilike ${pat} or ${users.name} ilike ${pat} or ${contractorAccounts.businessName} ilike ${pat} or ${contractorAccounts.city} ilike ${pat})`
        : sql`(${users.email} ilike ${pat} or ${users.name} ilike ${pat})`,
    );
  }
  const whereClause = and(...where);

  type BaseRow = {
    id: string;
    clerkUserId: string | null;
    email: string | null;
    phone: string | null;
    name: string | null;
    status: string;
    createdAt: Date;
    suspendedUntil: Date | null;
    archivedAt: Date | null;
    userCountry: string | null;
    userRegionCode: string | null;
    userCity: string | null;
    accountUserId: string | null;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    country: string | null;
    regionCode: string | null;
    city: string | null;
    approved: boolean | null;
    payoutStatus: string | null;
    stripeAccountId: string | null;
    contractorStatus: string | null;
    contractorBusinessName: string | null;
    contractorStripeAccountId: string | null;
    contractorStripePayoutsEnabled: boolean | null;
  };

  let totalCount = 0;
  let rows: BaseRow[] = [];

  if (!hasAccounts) {
    const [countRows, baseRows] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(users).where(whereClause),
      db
        .select({
          id: users.id,
          clerkUserId: users.clerkUserId,
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
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(params.pageSize)
        .offset(offset),
    ]);

    totalCount = Number(countRows[0]?.total ?? 0);
    rows = baseRows.map((r) => ({
      ...r,
      accountUserId: null,
      firstName: null,
      lastName: null,
      businessName: null,
      country: null,
      regionCode: null,
      city: null,
      approved: null,
      payoutStatus: null,
      stripeAccountId: null,
      contractorStatus: null,
      contractorBusinessName: null,
      contractorStripeAccountId: null,
      contractorStripePayoutsEnabled: null,
    }));
  } else if (!hasContractors) {
    const [countRows, baseRows] = await Promise.all([
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
        .where(whereClause),
      db
        .select({
          id: users.id,
          clerkUserId: users.clerkUserId,
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
          accountUserId: contractorAccounts.userId,
          firstName: contractorAccounts.firstName,
          lastName: contractorAccounts.lastName,
          businessName: contractorAccounts.businessName,
          country: contractorAccounts.country,
          regionCode: contractorAccounts.regionCode,
          city: contractorAccounts.city,
          approved: contractorAccounts.isApproved,
          payoutStatus: contractorAccounts.payoutStatus,
          stripeAccountId: contractorAccounts.stripeAccountId,
        })
        .from(users)
        .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(params.pageSize)
        .offset(offset),
    ]);

    totalCount = Number(countRows[0]?.total ?? 0);
    rows = baseRows.map((r) => ({
      ...r,
      contractorStatus: null,
      contractorBusinessName: null,
      contractorStripeAccountId: null,
      contractorStripePayoutsEnabled: null,
    }));
  } else {
    const [countRows, baseRows] = await Promise.all([
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
        .leftJoin(contractors, eq(contractors.email, users.email))
        .where(whereClause),
      db
        .select({
          id: users.id,
          clerkUserId: users.clerkUserId,
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
          accountUserId: contractorAccounts.userId,
          firstName: contractorAccounts.firstName,
          lastName: contractorAccounts.lastName,
          businessName: contractorAccounts.businessName,
          country: contractorAccounts.country,
          regionCode: contractorAccounts.regionCode,
          city: contractorAccounts.city,
          approved: contractorAccounts.isApproved,
          payoutStatus: contractorAccounts.payoutStatus,
          stripeAccountId: contractorAccounts.stripeAccountId,
          contractorStatus: contractors.status,
          contractorBusinessName: contractors.businessName,
          contractorStripeAccountId: contractors.stripeAccountId,
          contractorStripePayoutsEnabled: contractors.stripePayoutsEnabled,
        })
        .from(users)
        .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
        .leftJoin(contractors, eq(contractors.email, users.email))
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(params.pageSize)
        .offset(offset),
    ]);

    totalCount = Number(countRows[0]?.total ?? 0);
    rows = baseRows;
  }

  const userIds = rows.map((r) => r.id);
  const [profileMap, stripeMap] = await Promise.all([
    loadContractorProfileFallbacks(userIds, hasProfilesV4),
    loadStripeMethodFallbacks(userIds, hasPayoutMethods),
  ]);

  return {
    rows: rows.map((r) => {
      const profile = profileMap.get(r.id);
      const stripe = stripeMap.get(r.id);

      const fullNameFromAccount = joinName(r.firstName, r.lastName);
      const fullNameFromProfile = joinName(profile?.firstName, profile?.lastName);
      const name = pickName([
        r.name,
        fullNameFromAccount,
        profile?.contactName,
        fullNameFromProfile,
        r.businessName,
        r.contractorBusinessName,
        profile?.businessName,
      ]);

      const email = pickName([r.email, profile?.email]);
      const businessName = pickName([r.businessName, r.contractorBusinessName, profile?.businessName]);
      const country = pickName([r.country, profile?.countryCode, r.userCountry]);
      const regionCode = pickName([r.regionCode, r.userRegionCode]);
      const city = pickName([r.city, profile?.city, r.userCity]);

      const approvalBadge = String(r.contractorStatus ?? "").toUpperCase() === "REJECTED"
        ? "REJECTED"
        : "APPROVED";

      const payoutStatus = String(r.payoutStatus ?? "").toUpperCase();
      const stripeConnected = Boolean(
        pickName([r.stripeAccountId, r.contractorStripeAccountId, stripe?.stripeAccountId ?? null]),
      );
      const stripeVerified =
        Boolean(r.contractorStripePayoutsEnabled) ||
        Boolean(stripe?.stripePayoutsEnabled) ||
        ["ACTIVE", "VERIFIED", "READY"].includes(payoutStatus);

      const profileBadge = r.accountUserId
        ? profile
          ? "PROFILE_SYNCED"
          : "PROFILE_CANONICAL_ONLY"
        : profile
          ? "PROFILE_V4_ONLY"
          : "PROFILE_MISSING";

      return {
        ...r,
        clerkUserId: r.clerkUserId ?? null,
        name,
        email,
        businessName,
        createdAt: r.createdAt.toISOString(),
        suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        country,
        regionCode,
        city,
        role: "CONTRACTOR",
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
        formattedAddress: profile?.formattedAddress ?? null,
        badges: [approvalBadge, stripeBadge(stripeConnected, stripeVerified), profileBadge],
      };
    }),
    totalCount,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export const contractorsRepo = {
  parseRoleListParams,
  list,
};
