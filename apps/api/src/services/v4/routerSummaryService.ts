import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { ROUTING_STATUS } from "@/src/router/routingStatus";
import { routers } from "@/db/schema/router";
import { v4SupportTickets } from "@/db/schema/v4SupportTicket";
import { promoteDuePublishedJobsForRouter } from "./jobExecutionService";

export async function getV4RouterSummary(userId: string) {
  await promoteDuePublishedJobsForRouter(userId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(dayStart);
  weekStart.setDate(dayStart.getDate() - dayStart.getDay());

  const [summaryRows, routerRows, supportRows, recentRows] = await Promise.all([
    db
      .select({
        totalRouted: sql<number>`count(*)::int`,
        activeRoutes: sql<number>`count(*) filter (where ${jobs.status} in ('ASSIGNED', 'JOB_STARTED', 'IN_PROGRESS'))::int`,
        awaitingContractorAcceptance: sql<number>`count(*) filter (where ${jobs.routing_status} in ('INVITES_SENT', 'ROUTED_BY_ROUTER'))::int`,
        pendingCompletionApproval: sql<number>`count(*) filter (where ${jobs.contractor_completed_at} is not null and ${jobs.router_approved_at} is null)::int`,
        completedThisMonth: sql<number>`count(*) filter (where ${jobs.router_approved_at} >= ${monthStart})::int`,
        earningsWeekCents: sql<number>`coalesce(sum(${jobs.router_earnings_cents}) filter (where ${jobs.released_at} >= ${weekStart}), 0)::int`,
        earningsMonthCents: sql<number>`coalesce(sum(${jobs.router_earnings_cents}) filter (where ${jobs.released_at} >= ${monthStart}), 0)::int`,
        earningsLifetimeCents: sql<number>`coalesce(sum(${jobs.router_earnings_cents}) filter (where ${jobs.released_at} is not null), 0)::int`,
        earningsPendingReleaseCents: sql<number>`coalesce(sum(${jobs.router_earnings_cents}) filter (where ${jobs.router_approved_at} is not null and ${jobs.released_at} is null), 0)::int`,
        routesUsedToday: sql<number>`count(*) filter (where ${jobs.claimed_at} >= ${dayStart})::int`,
      })
      .from(jobs)
      .where(eq(jobs.claimed_by_user_id, userId)),
    db
      .select({
        isSeniorRouter: routers.isSeniorRouter,
        dailyRouteLimit: routers.dailyRouteLimit,
      })
      .from(routers)
      .where(eq(routers.userId, userId))
      .limit(1),
    db
      .select({
        openSupportTickets: sql<number>`count(*)::int`,
      })
      .from(v4SupportTickets)
      .where(and(eq(v4SupportTickets.userId, userId), eq(v4SupportTickets.role, "ROUTER"), eq(v4SupportTickets.status, "OPEN"))),
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        city: jobs.city,
        status: jobs.status,
        routingStatus: jobs.routing_status,
        updatedAt: jobs.updated_at,
      })
      .from(jobs)
      .where(eq(jobs.claimed_by_user_id, userId))
      .orderBy(desc(jobs.updated_at), desc(jobs.id))
      .limit(8),
  ]);

  const summary = summaryRows[0] ?? null;
  const router = routerRows[0] ?? null;
  const support = supportRows[0] ?? null;

  const activity = recentRows.map((row) => {
    const place = row.city?.trim() ? ` - ${row.city.trim()}` : "";
    const title = `${row.title}${place}`;
    const status = String(row.status ?? "");
    const routingStatus = String(row.routingStatus ?? "");

    let event = "Job Updated";
    const invitesSent = [ROUTING_STATUS.INVITES_SENT, ROUTING_STATUS.ROUTED_BY_ROUTER].includes(routingStatus as any);
    if (invitesSent && (status === "OPEN_FOR_ROUTING" || status === "INVITED")) event = "Awaiting Contractor Response";
    else if (status === "ASSIGNED") event = "Assigned to Contractor";
    else if (status === "JOB_STARTED" || status === "IN_PROGRESS") event = "In Progress";
    else if (status === "CONTRACTOR_COMPLETED") event = "Awaiting Completion Approval";
    else if (status === "CUSTOMER_APPROVED" || status === "CUSTOMER_REJECTED") event = "Completion Finalized";

    return {
      id: row.id,
      title,
      event,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  });

  const routesUsedToday = summary ? Number((summary as any).routesUsedToday ?? 0) : 0;
  const dailyRouteLimit = router ? Number((router as any).dailyRouteLimit ?? 10) : 10;
  const remainingCapacity = Math.max(0, dailyRouteLimit - routesUsedToday);

  const actionRequired = {
    pendingCompletionApproval: summary ? Number((summary as any).pendingCompletionApproval ?? 0) : 0,
    awaitingContractorAcceptance: summary ? Number((summary as any).awaitingContractorAcceptance ?? 0) : 0,
    supportTicketsRequiringInput: support ? Number((support as any).openSupportTickets ?? 0) : 0,
  };

  return {
    performance: {
      totalRouted: summary ? Number((summary as any).totalRouted ?? 0) : 0,
      activeRoutes: summary ? Number((summary as any).activeRoutes ?? 0) : 0,
      awaitingContractorAcceptance: actionRequired.awaitingContractorAcceptance,
      pendingCompletionApproval: actionRequired.pendingCompletionApproval,
      completedThisMonth: summary ? Number((summary as any).completedThisMonth ?? 0) : 0,
    },
    capacity: {
      routesUsedToday,
      dailyRouteLimit,
      remainingCapacity,
      isSeniorRouter: Boolean(router?.isSeniorRouter),
      status: remainingCapacity === 0 ? "LIMIT_REACHED" : remainingCapacity <= 2 ? "NEAR_LIMIT" : "AVAILABLE",
    },
    earnings: {
      weekCents: summary ? Number((summary as any).earningsWeekCents ?? 0) : 0,
      monthCents: summary ? Number((summary as any).earningsMonthCents ?? 0) : 0,
      lifetimeCents: summary ? Number((summary as any).earningsLifetimeCents ?? 0) : 0,
      pendingReleaseCents: summary ? Number((summary as any).earningsPendingReleaseCents ?? 0) : 0,
    },
    actionRequired,
    recentActivity: activity,
  };
}
