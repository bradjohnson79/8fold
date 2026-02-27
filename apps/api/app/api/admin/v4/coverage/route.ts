import { sql } from "drizzle-orm";
import { db, getDbIdentity, invitesRepo, requireAdmin, tableExists } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

async function scalarCount(query: any): Promise<number> {
  const res = await db.execute<{ count: number }>(query);
  return Number((res as any)?.rows?.[0]?.count ?? 0);
}

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const [
      dbIdentity,
      hasContractorsTable,
      hasContractorAccountsTable,
      hasRoutersTable,
      hasPayoutMethodsTable,
    ] = await Promise.all([
      getDbIdentity(),
      tableExists("Contractor"),
      tableExists("contractor_accounts"),
      tableExists("routers"),
      tableExists("PayoutMethod"),
    ]);

    const [userTotal, usersActive, usersInactive, userRoleRows] = await Promise.all([
      scalarCount(sql`select count(*)::int as count from "User"`),
      scalarCount(sql`select count(*)::int as count from "User" where status = 'ACTIVE'`),
      scalarCount(sql`select count(*)::int as count from "User" where status <> 'ACTIVE'`),
      db.execute<{ role: string; count: number }>(sql`select role::text as role, count(*)::int as count from "User" group by role`),
    ]);

    const roleMap = new Map<string, number>();
    for (const row of (userRoleRows as any)?.rows ?? []) {
      roleMap.set(String(row.role).toUpperCase(), Number(row.count ?? 0));
    }
    const unknownRoles = Array.from(roleMap.keys()).filter(
      (r) => !["ADMIN", "CONTRACTOR", "JOB_POSTER", "ROUTER"].includes(r),
    );

    const [jobsTotal, jobsByStatusRows, jobsMock] = await Promise.all([
      scalarCount(sql`select count(*)::int as count from jobs`),
      db.execute<{ status: string; count: number }>(sql`select status::text as status, count(*)::int as count from jobs group by status`),
      scalarCount(sql`select count(*)::int as count from jobs where is_mock = true`),
    ]);

    const jobsStatusMap = new Map<string, number>();
    for (const row of (jobsByStatusRows as any)?.rows ?? []) {
      jobsStatusMap.set(String(row.status).toUpperCase(), Number(row.count ?? 0));
    }

    let contractorsTotal = 0;
    let contractorsApproved = 0;
    let contractorsPending = 0;
    let contractorsRejected = 0;
    let contractorsStripeConnected = 0;
    let contractorsStripeVerified = 0;

    if (hasContractorsTable) {
      [
        contractorsTotal,
        contractorsApproved,
        contractorsPending,
        contractorsRejected,
        contractorsStripeConnected,
        contractorsStripeVerified,
      ] = await Promise.all([
        scalarCount(sql`select count(*)::int as count from "Contractor"`),
        scalarCount(sql`select count(*)::int as count from "Contractor" where status = 'APPROVED'`),
        scalarCount(sql`select count(*)::int as count from "Contractor" where status = 'PENDING'`),
        scalarCount(sql`select count(*)::int as count from "Contractor" where status = 'REJECTED'`),
        scalarCount(sql`select count(*)::int as count from "Contractor" where "stripeAccountId" is not null`),
        scalarCount(sql`select count(*)::int as count from "Contractor" where "stripePayoutsEnabled" = true`),
      ]);
    } else if (hasContractorAccountsTable) {
      [contractorsTotal, contractorsApproved, contractorsStripeConnected] = await Promise.all([
        scalarCount(sql`select count(*)::int as count from contractor_accounts`),
        scalarCount(sql`select count(*)::int as count from contractor_accounts where "isApproved" = true`),
        scalarCount(sql`select count(*)::int as count from contractor_accounts where "stripeAccountId" is not null`),
      ]);
      contractorsPending = Math.max(0, contractorsTotal - contractorsApproved);
      contractorsRejected = 0;
      contractorsStripeVerified = await scalarCount(
        sql`select count(*)::int as count from contractor_accounts where coalesce("payoutStatus", '') in ('ACTIVE','VERIFIED','READY')`,
      );
    }

    let routersTotal = 0;
    let routersStripeConnected = 0;
    let routersStripeVerified = 0;

    if (hasRoutersTable) {
      routersTotal = await scalarCount(sql`select count(*)::int as count from routers`);
    } else {
      routersTotal = roleMap.get("ROUTER") ?? 0;
    }

    if (hasPayoutMethodsTable) {
      [routersStripeConnected, routersStripeVerified] = await Promise.all([
        scalarCount(sql`
          select count(distinct pm."userId")::int as count
          from "PayoutMethod" pm
          inner join "User" u on u.id = pm."userId"
          where u.role = 'ROUTER' and pm."isActive" = true
        `),
        scalarCount(sql`
          select count(distinct pm."userId")::int as count
          from "PayoutMethod" pm
          inner join "User" u on u.id = pm."userId"
          where u.role = 'ROUTER' and pm."isActive" = true and coalesce(pm.provider::text, '') <> ''
        `),
      ]);
    }

    const invites = await invitesRepo.getInviteStatusCounts();

    const coverage = {
      users: {
        total: userTotal,
        byRole: {
          JOB_POSTER: roleMap.get("JOB_POSTER") ?? 0,
          CONTRACTOR: roleMap.get("CONTRACTOR") ?? 0,
          ROUTER: roleMap.get("ROUTER") ?? 0,
          ADMIN: roleMap.get("ADMIN") ?? 0,
        },
        active: usersActive,
        inactive: usersInactive,
      },
      jobPosters: {
        total: roleMap.get("JOB_POSTER") ?? 0,
      },
      jobs: {
        total: jobsTotal,
        byStatus: {
          PUBLISHED: jobsStatusMap.get("PUBLISHED") ?? 0,
          OPEN_FOR_ROUTING: jobsStatusMap.get("OPEN_FOR_ROUTING") ?? 0,
          ROUTING_IN_PROGRESS: jobsStatusMap.get("ROUTING_IN_PROGRESS") ?? 0,
          ASSIGNED: jobsStatusMap.get("ASSIGNED") ?? 0,
          IN_PROGRESS: jobsStatusMap.get("IN_PROGRESS") ?? 0,
          COMPLETED: jobsStatusMap.get("COMPLETED") ?? jobsStatusMap.get("COMPLETED_APPROVED") ?? 0,
        },
        mock: jobsMock,
        real: Math.max(0, jobsTotal - jobsMock),
      },
      contractors: {
        total: contractorsTotal,
        approved: contractorsApproved,
        pending: contractorsPending,
        rejected: contractorsRejected,
        stripeConnected: contractorsStripeConnected,
        stripeVerified: contractorsStripeVerified,
      },
      routers: {
        total: routersTotal,
        stripeConnected: routersStripeConnected,
        stripeVerified: routersStripeVerified,
      },
      invites: {
        total: invites.total,
        pending: invites.pending,
        accepted: invites.accepted,
        declined: invites.declined,
        autoDeclined: invites.autoDeclined,
      },
    };

    const integrityWarnings: string[] = [];
    if (coverage.jobs.total > 0 && coverage.users.byRole.JOB_POSTER === 0) {
      integrityWarnings.push("Jobs exist but no job posters found.");
    }
    if (coverage.contractors.total > 0 && coverage.users.byRole.CONTRACTOR === 0) {
      integrityWarnings.push("Contractors exist but contractor role users are zero.");
    }
    if (coverage.jobs.byStatus.OPEN_FOR_ROUTING > 0 && coverage.routers.total === 0) {
      integrityWarnings.push("Jobs are open for routing but no routers found.");
    }
    if (coverage.contractors.total > 0 && coverage.contractors.stripeConnected === 0) {
      integrityWarnings.push("Contractors exist but none connected to Stripe.");
    }
    if (unknownRoles.length > 0) {
      integrityWarnings.push(`Non-canonical user roles detected: ${unknownRoles.join(", ")}`);
    }

    return ok({
      ...coverage,
      unknownRoles,
      integrityWarnings,
      dbIdentity,
    });
  } catch (error) {
    console.error("[ADMIN_V4_COVERAGE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_COVERAGE_FAILED", "Failed to load data coverage");
  }
}
