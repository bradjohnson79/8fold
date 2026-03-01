import { and, gte, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import {
  financialIntegrityAlerts,
  jobs,
  payoutRequests,
  v4AdminDisputes,
  v4AdminSupportTickets,
} from "@/db/schema";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

const OPEN_JOB_STATUSES = ["OPEN_FOR_ROUTING", "ASSIGNED", "IN_PROGRESS", "CONTRACTOR_COMPLETED"];
const ACTIVE_ASSIGNMENT_STATUSES = ["ASSIGNED", "IN_PROGRESS", "CONTRACTOR_COMPLETED", "CUSTOMER_APPROVED"];
const CLOSED_DISPUTE_STATUSES = ["DECIDED", "CLOSED"];
const OPEN_SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS"];

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    totalJobsRows,
    openJobsRows,
    activeAssignmentsRows,
    pendingPayoutRows,
    openDisputesRows,
    openSupportRows,
    monthRevenueRows,
    lifetimeRevenueRows,
    integrityRows,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(jobs),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(inArray(jobs.status, OPEN_JOB_STATUSES as any), sql`${jobs.archived} = false`)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(inArray(jobs.status, ACTIVE_ASSIGNMENT_STATUSES as any), sql`${jobs.archived} = false`)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payoutRequests)
      .where(sql`${payoutRequests.status} = 'REQUESTED'`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(v4AdminDisputes)
      .where(notInArray(v4AdminDisputes.status, CLOSED_DISPUTE_STATUSES)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(v4AdminSupportTickets)
      .where(inArray(v4AdminSupportTickets.status, OPEN_SUPPORT_STATUSES)),
    db
      .select({ cents: sql<number>`coalesce(sum(${jobs.amount_cents}), 0)::int` })
      .from(jobs)
      .where(
        and(
          gte(jobs.created_at, monthStart),
          sql`${jobs.payment_status} in ('FUNDED','FUNDS_SECURED','AUTHORIZED') or ${jobs.payout_status} = 'RELEASED'`,
        ),
      ),
    db
      .select({ cents: sql<number>`coalesce(sum(${jobs.amount_cents}), 0)::int` })
      .from(jobs)
      .where(sql`${jobs.payment_status} in ('FUNDED','FUNDS_SECURED','AUTHORIZED') or ${jobs.payout_status} = 'RELEASED'`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(financialIntegrityAlerts)
      .where(sql`${financialIntegrityAlerts.status} = 'OPEN'`),
  ]);

  return ok({
    totalJobs: Number(totalJobsRows[0]?.count ?? 0),
    openJobs: Number(openJobsRows[0]?.count ?? 0),
    activeAssignments: Number(activeAssignmentsRows[0]?.count ?? 0),
    pendingPayouts: Number(pendingPayoutRows[0]?.count ?? 0),
    openDisputes: Number(openDisputesRows[0]?.count ?? 0),
    openSupportTickets: Number(openSupportRows[0]?.count ?? 0),
    stripeRevenueMonth: Number(monthRevenueRows[0]?.cents ?? 0),
    stripeRevenueLifetime: Number(lifetimeRevenueRows[0]?.cents ?? 0),
    integrityAlerts: Number(integrityRows[0]?.count ?? 0),
  });
}
