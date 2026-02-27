import { and, count, gte, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, v4AdminDisputes } from "@/db/schema";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";
import { contractorActivationMetrics } from "@/src/services/adminV4/usersReadService";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  const [revenueRows, throughputRows, activation, disputeRows] = await Promise.all([
    db
      .select({
        monthCents: sql<number>`coalesce(sum(case when ${jobs.created_at} >= ${monthStart} then ${jobs.amount_cents} else 0 end), 0)::int`,
        lifetimeCents: sql<number>`coalesce(sum(${jobs.amount_cents}), 0)::int`,
      })
      .from(jobs)
      .where(sql`${jobs.payment_status} in ('FUNDED','FUNDS_SECURED','AUTHORIZED') or ${jobs.payout_status} = 'RELEASED'`),
    db
      .select({
        total: count(),
        completed: count(sql`case when ${jobs.status} in ('COMPLETED','COMPLETED_APPROVED','CUSTOMER_APPROVED') then 1 end`),
      })
      .from(jobs),
    contractorActivationMetrics(),
    db
      .select({
        total: count(),
        open: count(sql`case when ${v4AdminDisputes.status} not in ('DECIDED','CLOSED') then 1 end`),
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
      total: Number(activation.total ?? 0),
      active: Number(activation.active ?? 0),
    },
    disputeRates: {
      total: Number(disputeRows[0]?.total ?? 0),
      open: Number(disputeRows[0]?.open ?? 0),
    },
  });
}
