import { and, gte, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminJobs } from "@/db/schema/v4AdminJob";
import { v4AdminPayoutRequests } from "@/db/schema/v4AdminPayoutRequest";
import { v4AdminDisputes } from "@/db/schema/v4AdminDispute";
import { v4AdminSupportTickets } from "@/db/schema/v4AdminSupportTicket";
import { v4AdminIntegrityAlerts } from "@/db/schema/v4AdminIntegrityAlert";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok } from "@/src/lib/api/adminV4Response";

const OPEN_JOB_STATUSES = ["PUBLISHED", "OPEN_FOR_ROUTING", "ASSIGNED", "IN_PROGRESS", "CONTRACTOR_COMPLETED"];
const ACTIVE_ASSIGNMENT_STATUSES = ["ASSIGNED", "IN_PROGRESS", "CONTRACTOR_COMPLETED", "CUSTOMER_APPROVED_AWAITING_ROUTER"];
const CLOSED_DISPUTE_STATUSES = ["DECIDED", "CLOSED"];
const OPEN_SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS"];

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [totalJobsRows, openJobsRows, activeAssignmentsRows, pendingPayoutRows, openDisputesRows, openSupportRows, monthRevenueRows, lifetimeRevenueRows, integrityRows] =
      await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(v4AdminJobs),
        db.select({ count: sql<number>`count(*)::int` }).from(v4AdminJobs).where(and(inArray(v4AdminJobs.status, OPEN_JOB_STATUSES), sql`${v4AdminJobs.archived} = false`)),
        db.select({ count: sql<number>`count(*)::int` }).from(v4AdminJobs).where(inArray(v4AdminJobs.assignmentStatus, ACTIVE_ASSIGNMENT_STATUSES)),
        db.select({ count: sql<number>`count(*)::int` }).from(v4AdminPayoutRequests).where(sql`${v4AdminPayoutRequests.status} = 'REQUESTED'`),
        db.select({ count: sql<number>`count(*)::int` }).from(v4AdminDisputes).where(notInArray(v4AdminDisputes.status, CLOSED_DISPUTE_STATUSES)),
        db.select({ count: sql<number>`count(*)::int` }).from(v4AdminSupportTickets).where(inArray(v4AdminSupportTickets.status, OPEN_SUPPORT_STATUSES)),
        db
          .select({ cents: sql<number>`coalesce(sum(${v4AdminJobs.amountCents}), 0)::int` })
          .from(v4AdminJobs)
          .where(and(sql`${v4AdminJobs.paymentStatus} in ('PAID','RELEASED')`, gte(v4AdminJobs.createdAt, monthStart))),
        db
          .select({ cents: sql<number>`coalesce(sum(${v4AdminJobs.amountCents}), 0)::int` })
          .from(v4AdminJobs)
          .where(sql`${v4AdminJobs.paymentStatus} in ('PAID','RELEASED')`),
        db.select({ count: sql<number>`count(*)::int` }).from(v4AdminIntegrityAlerts).where(sql`${v4AdminIntegrityAlerts.status} = 'OPEN'`),
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
  } catch (error) {
    console.error("[ADMIN_V4_OVERVIEW_FALLBACK]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return ok({
      totalJobs: 0,
      openJobs: 0,
      activeAssignments: 0,
      pendingPayouts: 0,
      openDisputes: 0,
      openSupportTickets: 0,
      stripeRevenueMonth: 0,
      stripeRevenueLifetime: 0,
      integrityAlerts: 0,
    });
  }
}
