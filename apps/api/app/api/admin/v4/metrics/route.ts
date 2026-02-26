import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminJobs } from "@/db/schema/v4AdminJob";
import { v4AdminDisputes } from "@/db/schema/v4AdminDispute";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  const [revenueRows, throughputRows, activationRows, disputeRows] = await Promise.all([
    db
      .select({
        monthCents: sql<number>`coalesce(sum(case when ${v4AdminJobs.createdAt} >= ${monthStart} then ${v4AdminJobs.amountCents} else 0 end), 0)::int`,
        lifetimeCents: sql<number>`coalesce(sum(${v4AdminJobs.amountCents}), 0)::int`,
      })
      .from(v4AdminJobs)
      .where(sql`${v4AdminJobs.paymentStatus} in ('PAID','RELEASED')`),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${v4AdminJobs.status} in ('COMPLETED','CUSTOMER_APPROVED_AWAITING_ROUTER'))::int`,
      })
      .from(v4AdminJobs),
    db
      .select({
        contractorTotal: sql<number>`count(*) filter (where ${v4AdminUsers.role} = 'CONTRACTOR')::int`,
        contractorActive: sql<number>`count(*) filter (where ${v4AdminUsers.role} = 'CONTRACTOR' and ${v4AdminUsers.status} = 'ACTIVE')::int`,
      })
      .from(v4AdminUsers),
    db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${v4AdminDisputes.status} not in ('DECIDED','CLOSED'))::int`,
      })
      .from(v4AdminDisputes),
  ]);

  return ok({
    revenue: {
      monthCents: Number(revenueRows[0]?.monthCents ?? 0),
      lifetimeCents: Number(revenueRows[0]?.lifetimeCents ?? 0),
    },
    jobThroughput: {
      totalJobs: Number(throughputRows[0]?.total ?? 0),
      completedJobs: Number(throughputRows[0]?.completed ?? 0),
    },
    contractorActivation: {
      total: Number(activationRows[0]?.contractorTotal ?? 0),
      active: Number(activationRows[0]?.contractorActive ?? 0),
    },
    disputeRates: {
      total: Number(disputeRows[0]?.total ?? 0),
      open: Number(disputeRows[0]?.open ?? 0),
    },
  });
}
