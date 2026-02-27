import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/src/adminBus/db";
import { contractorAccounts, contractors, users } from "@/db/schema";
import { tableExists } from "@/src/adminBus/schemaIntrospection";
import { parseRoleListParams, type RoleListParams } from "@/src/adminBus/repos/jobPosters.repo";

export { parseRoleListParams };

export async function list(params: RoleListParams) {
  const offset = (params.page - 1) * params.pageSize;
  const hasAccounts = await tableExists("contractor_accounts");

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

  if (!hasAccounts) {
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
        role: "CONTRACTOR",
        city: null,
        badges: ["PROFILE_MISSING"],
      })),
      totalCount: Number(countRows[0]?.total ?? 0),
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const hasContractors = await tableExists("Contractor");

  if (!hasContractors) {
    const [countRows, rows] = await Promise.all([
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
        .where(whereClause),
      db
        .select({
          id: users.id,
          email: users.email,
          phone: users.phone,
          name: users.name,
          firstName: contractorAccounts.firstName,
          lastName: contractorAccounts.lastName,
          businessName: contractorAccounts.businessName,
          status: users.status,
          createdAt: users.createdAt,
          suspendedUntil: users.suspendedUntil,
          archivedAt: users.archivedAt,
          country: contractorAccounts.country,
          regionCode: contractorAccounts.regionCode,
          city: contractorAccounts.city,
          approved: contractorAccounts.isApproved,
          stripeAccountId: contractorAccounts.stripeAccountId,
        })
        .from(users)
        .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(params.pageSize)
        .offset(offset),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        email: r.email,
        phone: r.phone,
        name: r.name ?? ([r.firstName, r.lastName].filter(Boolean).join(" ") || r.businessName || null),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        country: r.country ?? null,
        regionCode: r.regionCode ?? null,
        city: r.city ?? null,
        role: "CONTRACTOR",
        badges: [r.approved ? "APPROVED" : "PENDING_APPROVAL", r.stripeAccountId ? "STRIPE_CONNECTED" : "STRIPE_MISSING"],
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
      .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
      .leftJoin(contractors, eq(contractors.email, users.email))
      .where(whereClause),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        name: users.name,
        firstName: contractorAccounts.firstName,
        lastName: contractorAccounts.lastName,
        businessName: contractorAccounts.businessName,
        status: users.status,
        createdAt: users.createdAt,
        suspendedUntil: users.suspendedUntil,
        archivedAt: users.archivedAt,
        country: contractorAccounts.country,
        regionCode: contractorAccounts.regionCode,
        city: contractorAccounts.city,
        approved: contractorAccounts.isApproved,
        stripeAccountId: contractorAccounts.stripeAccountId,
        contractorStatus: contractors.status,
        contractorStripeAccountId: contractors.stripeAccountId,
      })
      .from(users)
      .leftJoin(contractorAccounts, eq(contractorAccounts.userId, users.id))
      .leftJoin(contractors, eq(contractors.email, users.email))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(params.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      phone: r.phone,
      name: r.name ?? ([r.firstName, r.lastName].filter(Boolean).join(" ") || r.businessName || null),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      suspendedUntil: r.suspendedUntil?.toISOString() ?? null,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      country: r.country ?? null,
      regionCode: r.regionCode ?? null,
      city: r.city ?? null,
      role: "CONTRACTOR",
      badges: [
        r.approved ? "APPROVED" : "PENDING_APPROVAL",
        r.contractorStatus ? `CONTRACTOR:${r.contractorStatus}` : "CONTRACTOR_ROW_MISSING",
        r.stripeAccountId || r.contractorStripeAccountId ? "STRIPE_CONNECTED" : "STRIPE_MISSING",
      ],
    })),
    totalCount: Number(countRows[0]?.total ?? 0),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export const contractorsRepo = {
  parseRoleListParams,
  list,
};
