import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db/drizzle";
import {
  auditLogs,
  contractors,
  conversations,
  jobAssignments,
  jobDispatches,
  jobs,
  messages,
  pmReceipts,
  pmRequests,
  users,
} from "@/db/schema";
import type {
  AdminJobDetail,
  AdminJobRelated,
  AdminJobsListResult,
  AdminJobRow,
  AdminPartySummary,
  AdminTimelineEvent,
} from "@/src/services/adminV4/types";

type ListParams = {
  status: string | null;
  isMock: boolean | null;
  q: string;
  createdFrom: Date | null;
  createdTo: Date | null;
  showArchived: boolean;
  page: number;
  pageSize: number;
  sort: "createdAt:desc" | "createdAt:asc" | "updatedAt:desc" | "updatedAt:asc";
};

function toIso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

function asDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBoolish(v: string | null): boolean | null {
  const n = String(v ?? "").trim().toLowerCase();
  if (!n) return null;
  if (["1", "true", "yes", "mock", "only_mock", "onlymock"].includes(n)) return true;
  if (["0", "false", "no", "real", "only_real", "onlyreal"].includes(n)) return false;
  return null;
}

function parsePage(v: string | null): number {
  const n = Number(v ?? "1");
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function parsePageSize(v: string | null): number {
  const n = Number(v ?? "25");
  if (!Number.isFinite(n)) return 25;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function parseSort(v: string | null): ListParams["sort"] {
  const s = String(v ?? "createdAt:desc").trim();
  if (s === "createdAt:asc") return s;
  if (s === "updatedAt:asc") return s;
  if (s === "updatedAt:desc") return s;
  return "createdAt:desc";
}

function buildPaymentState(row: {
  payment_status: string | null;
  payout_status: string | null;
  funds_secured_at: Date | null;
  escrow_locked_at: Date | null;
  payment_captured_at: Date | null;
  released_at: Date | null;
  refunded_at: Date | null;
}) {
  const paymentStatus = String(row.payment_status ?? "").toUpperCase();
  const payoutStatus = String(row.payout_status ?? "").toUpperCase();
  const secured = Boolean(row.funds_secured_at || row.escrow_locked_at || paymentStatus === "AUTHORIZED" || paymentStatus === "FUNDS_SECURED" || paymentStatus === "FUNDED");
  const captured = Boolean(row.payment_captured_at || paymentStatus === "FUNDED");
  const paid = Boolean(row.released_at || payoutStatus === "RELEASED");
  const refunded = Boolean(row.refunded_at || paymentStatus === "REFUNDED");

  const label = refunded ? "REFUNDED" : paid ? "PAID" : captured ? "CAPTURED" : secured ? "SECURED" : "UNPAID";

  return {
    secured,
    captured,
    paid,
    label,
    rawPaymentStatus: row.payment_status,
    rawPayoutStatus: row.payout_status,
  } as const;
}

function deriveDisplayStatus(row: {
  is_mock: boolean;
  status: string;
  router_approved_at: Date | null;
}): string {
  if (row.is_mock) return "IN_PROGRESS";
  if ((row.status === "OPEN_FOR_ROUTING" || row.status === "CUSTOMER_APPROVED") && !row.router_approved_at) {
    return "CUSTOMER_APPROVED_AWAITING_ROUTER";
  }
  return row.status;
}

function toParty(user: { id: string; name: string | null; email: string | null; role: string | null } | null): AdminPartySummary | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function parseJobsListParams(searchParams: URLSearchParams): ListParams {
  const statusRaw = String(searchParams.get("status") ?? "").trim().toUpperCase();
  const status = statusRaw && statusRaw !== "ALL" ? statusRaw : null;

  const showArchivedRaw = String(searchParams.get("showArchived") ?? "1").trim().toLowerCase();
  const showArchived = !["0", "false", "no", "off"].includes(showArchivedRaw);

  const isMock = parseBoolish(searchParams.get("is_mock") ?? searchParams.get("isMock"));
  const q = String(searchParams.get("q") ?? "").trim();

  const createdFrom = asDate(String(searchParams.get("createdFrom") ?? "").trim() || null);
  const createdTo = asDate(String(searchParams.get("createdTo") ?? "").trim() || null);

  return {
    status,
    isMock,
    q,
    createdFrom,
    createdTo,
    showArchived,
    page: parsePage(searchParams.get("page")),
    pageSize: parsePageSize(searchParams.get("pageSize")),
    sort: parseSort(searchParams.get("sort")),
  };
}

export async function listAdminJobs(params: ListParams): Promise<AdminJobsListResult> {
  const posterUser = alias(users, "poster_user");

  const where = [] as any[];

  if (params.status) {
    if (params.status === "CUSTOMER_APPROVED_AWAITING_ROUTER") {
      where.push(
        or(
          eq(jobs.status, "OPEN_FOR_ROUTING" as any),
          and(eq(jobs.status, "CUSTOMER_APPROVED" as any), isNull(jobs.router_approved_at)),
        ),
      );
    } else {
      where.push(eq(jobs.status, params.status as any));
    }
  }

  if (params.isMock !== null) where.push(eq(jobs.is_mock, params.isMock));
  if (!params.showArchived) where.push(eq(jobs.archived, false));
  if (params.createdFrom) where.push(gte(jobs.created_at, params.createdFrom));
  if (params.createdTo) where.push(lte(jobs.created_at, params.createdTo));

  if (params.q) {
    const pattern = `%${params.q}%`;
    where.push(
      or(
        ilike(jobs.id, pattern),
        ilike(jobs.title, pattern),
        ilike(jobs.scope, pattern),
        ilike(posterUser.email, pattern),
      ),
    );
  }

  const whereClause = where.length ? and(...where) : undefined;
  const offset = (params.page - 1) * params.pageSize;

  const [countRows, jobRows] = await Promise.all([
    db
      .select({ total: count() })
      .from(jobs)
      .leftJoin(posterUser, eq(posterUser.id, jobs.job_poster_user_id))
      .where(whereClause as any),
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        is_mock: jobs.is_mock,
        country: jobs.country,
        region_code: jobs.region_code,
        city: jobs.city,
        address_full: jobs.address_full,
        created_at: jobs.created_at,
        updated_at: jobs.updated_at,
        amount_cents: jobs.amount_cents,
        payment_status: jobs.payment_status,
        payout_status: jobs.payout_status,
        funds_secured_at: jobs.funds_secured_at,
        escrow_locked_at: jobs.escrow_locked_at,
        payment_captured_at: jobs.payment_captured_at,
        released_at: jobs.released_at,
        refunded_at: jobs.refunded_at,
        routing_status: jobs.routing_status,
        trade_category: jobs.trade_category,
        archived: jobs.archived,
        router_approved_at: jobs.router_approved_at,
        job_source: jobs.job_source,
        contractor_user_id: jobs.contractor_user_id,
        poster_id: posterUser.id,
        poster_name: posterUser.name,
        poster_email: posterUser.email,
        poster_role: posterUser.role,
      })
      .from(jobs)
      .leftJoin(posterUser, eq(posterUser.id, jobs.job_poster_user_id))
      .where(whereClause as any)
      .orderBy(
        params.sort === "createdAt:asc"
          ? sql`${jobs.created_at} asc`
          : params.sort === "updatedAt:asc"
            ? sql`${jobs.updated_at} asc`
            : params.sort === "updatedAt:desc"
              ? sql`${jobs.updated_at} desc`
              : sql`${jobs.created_at} desc`,
      )
      .limit(params.pageSize)
      .offset(offset),
  ]);

  const totalCount = Number(countRows[0]?.total ?? 0);
  const jobIds = jobRows.map((r) => r.id);

  const [dispatchRows, assignmentRows] = jobIds.length
    ? await Promise.all([
        db
          .select({ jobId: jobDispatches.jobId, routerUserId: jobDispatches.routerUserId, createdAt: jobDispatches.createdAt })
          .from(jobDispatches)
          .where(inArray(jobDispatches.jobId, jobIds))
          .orderBy(desc(jobDispatches.createdAt)),
        db
          .select({
            jobId: jobAssignments.jobId,
            assignmentId: jobAssignments.id,
            assignmentStatus: jobAssignments.status,
            createdAt: jobAssignments.createdAt,
            contractorId: jobAssignments.contractorId,
            contractorBusinessName: contractors.businessName,
            contractorEmail: contractors.email,
          })
          .from(jobAssignments)
          .leftJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
          .where(inArray(jobAssignments.jobId, jobIds))
          .orderBy(desc(jobAssignments.createdAt)),
      ])
    : [[], []];

  const latestDispatchByJob = new Map<string, { routerUserId: string }>();
  for (const row of dispatchRows) {
    if (!latestDispatchByJob.has(row.jobId)) {
      latestDispatchByJob.set(row.jobId, { routerUserId: row.routerUserId });
    }
  }

  const latestAssignmentByJob = new Map<
    string,
    {
      assignmentId: string;
      assignmentStatus: string;
      contractorId: string;
      contractorBusinessName: string | null;
      contractorEmail: string | null;
    }
  >();
  for (const row of assignmentRows) {
    if (!latestAssignmentByJob.has(row.jobId)) {
      latestAssignmentByJob.set(row.jobId, {
        assignmentId: row.assignmentId,
        assignmentStatus: row.assignmentStatus,
        contractorId: row.contractorId,
        contractorBusinessName: row.contractorBusinessName,
        contractorEmail: row.contractorEmail,
      });
    }
  }

  const routerUserIds = Array.from(new Set(Array.from(latestDispatchByJob.values()).map((d) => d.routerUserId).filter(Boolean)));
  const contractorUserIds = Array.from(new Set(jobRows.map((r) => r.contractor_user_id).filter((v): v is string => Boolean(v))));

  const [routerUsers, contractorUsers] = await Promise.all([
    routerUserIds.length
      ? db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role })
          .from(users)
          .where(inArray(users.id, routerUserIds))
      : [],
    contractorUserIds.length
      ? db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role })
          .from(users)
          .where(inArray(users.id, contractorUserIds))
      : [],
  ]);

  const routerUserMap = new Map(routerUsers.map((u) => [u.id, u]));
  const contractorUserMap = new Map(contractorUsers.map((u) => [u.id, u]));

  const rows: AdminJobRow[] = jobRows.map((row) => {
    const dispatch = latestDispatchByJob.get(row.id) ?? null;
    const assignment = latestAssignmentByJob.get(row.id) ?? null;

    const contractorFromUser = row.contractor_user_id ? contractorUserMap.get(row.contractor_user_id) ?? null : null;
    const contractorSummary: AdminPartySummary | null = contractorFromUser
      ? toParty(contractorFromUser)
      : assignment
        ? {
            id: assignment.contractorId,
            name: assignment.contractorBusinessName,
            email: assignment.contractorEmail,
            role: "CONTRACTOR",
          }
        : null;

    const routerSummary = dispatch ? toParty(routerUserMap.get(dispatch.routerUserId) ?? null) : null;

    const statusRaw = String(row.status ?? "");
    const displayStatus = deriveDisplayStatus({
      is_mock: Boolean(row.is_mock),
      status: statusRaw,
      router_approved_at: row.router_approved_at,
    });

    return {
      id: row.id,
      title: row.title,
      statusRaw,
      displayStatus,
      isMock: Boolean(row.is_mock),
      country: String(row.country ?? ""),
      regionCode: row.region_code,
      city: row.city,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      amountCents: Number(row.amount_cents ?? 0),
      paymentState: buildPaymentState(row),
      jobPoster: row.poster_id
        ? {
            id: row.poster_id,
            name: row.poster_name,
            email: row.poster_email,
            role: row.poster_role,
          }
        : null,
      router: routerSummary,
      contractor: contractorSummary,
      routingStatus: String(row.routing_status ?? ""),
      tradeCategory: String(row.trade_category ?? ""),
      addressFull: row.address_full,
      archived: Boolean(row.archived),
    };
  });

  return {
    rows,
    totalCount,
    page: params.page,
    pageSize: params.pageSize,
  };
}

function pushTimeline(
  target: AdminTimelineEvent[],
  at: Date | null | undefined,
  type: string,
  label: string,
  source: AdminTimelineEvent["source"],
  detail: string | null = null,
  actor: string | null = null,
) {
  if (!at) return;
  target.push({ at: at.toISOString(), type, label, source, detail, actor });
}

export async function getAdminJobDetail(jobId: string): Promise<{
  job: AdminJobDetail;
  timeline: AdminTimelineEvent[];
  related: AdminJobRelated;
} | null> {
  const posterUser = alias(users, "poster_user_detail");

  const jobRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      scope: jobs.scope,
      status: jobs.status,
      is_mock: jobs.is_mock,
      country: jobs.country,
      region_code: jobs.region_code,
      city: jobs.city,
      postal_code: jobs.postal_code,
      address_full: jobs.address_full,
      lat: jobs.lat,
      lng: jobs.lng,
      created_at: jobs.created_at,
      updated_at: jobs.updated_at,
      published_at: jobs.published_at,
      archived: jobs.archived,
      job_source: jobs.job_source,
      trade_category: jobs.trade_category,
      routing_status: jobs.routing_status,
      amount_cents: jobs.amount_cents,
      payment_status: jobs.payment_status,
      payout_status: jobs.payout_status,
      funds_secured_at: jobs.funds_secured_at,
      escrow_locked_at: jobs.escrow_locked_at,
      payment_captured_at: jobs.payment_captured_at,
      released_at: jobs.released_at,
      refunded_at: jobs.refunded_at,
      router_approved_at: jobs.router_approved_at,
      contractor_user_id: jobs.contractor_user_id,
      job_poster_user_id: jobs.job_poster_user_id,
      first_routed_at: jobs.first_routed_at,
      routed_at: jobs.routed_at,
      contractor_completed_at: jobs.contractor_completed_at,
      customer_approved_at: jobs.customer_approved_at,
      customer_rejected_at: jobs.customer_rejected_at,
      completion_flagged_at: jobs.completion_flagged_at,
      accepted_at: jobs.accepted_at,
      funded_at: jobs.funded_at,
      poster_id: posterUser.id,
      poster_name: posterUser.name,
      poster_email: posterUser.email,
      poster_role: posterUser.role,
    })
    .from(jobs)
    .leftJoin(posterUser, eq(posterUser.id, jobs.job_poster_user_id))
    .where(eq(jobs.id, jobId))
    .limit(1);

  const row = jobRows[0] ?? null;
  if (!row) return null;

  const [dispatchRows, assignmentRows, contractorUserRows, auditRows, pmRows, receiptRows, messageStats] = await Promise.all([
    db
      .select({
        id: jobDispatches.id,
        routerUserId: jobDispatches.routerUserId,
        status: jobDispatches.status,
        createdAt: jobDispatches.createdAt,
        respondedAt: jobDispatches.respondedAt,
      })
      .from(jobDispatches)
      .where(eq(jobDispatches.jobId, jobId))
      .orderBy(desc(jobDispatches.createdAt)),
    db
      .select({
        id: jobAssignments.id,
        jobId: jobAssignments.jobId,
        status: jobAssignments.status,
        createdAt: jobAssignments.createdAt,
        completedAt: jobAssignments.completedAt,
        contractorId: jobAssignments.contractorId,
        contractorBusinessName: contractors.businessName,
        contractorEmail: contractors.email,
      })
      .from(jobAssignments)
      .leftJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
      .where(eq(jobAssignments.jobId, jobId))
      .orderBy(desc(jobAssignments.createdAt)),
    row.contractor_user_id
      ? db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role })
          .from(users)
          .where(eq(users.id, row.contractor_user_id))
          .limit(1)
      : [],
    db
      .select({
        createdAt: auditLogs.createdAt,
        action: auditLogs.action,
        actorUserId: auditLogs.actorUserId,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, "Job"), eq(auditLogs.entityId, jobId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100),
    db
      .select({
        count: count(),
        latest: sql<Date | null>`max(${pmRequests.createdAt})`,
      })
      .from(pmRequests)
      .where(eq(pmRequests.jobId, jobId)),
    db
      .select({
        count: count(),
        latest: sql<Date | null>`max(${pmReceipts.createdAt})`,
      })
      .from(pmReceipts)
      .innerJoin(pmRequests, eq(pmRequests.id, pmReceipts.pmRequestId))
      .where(eq(pmRequests.jobId, jobId)),
    db
      .select({
        threadCount: count(sql`distinct ${conversations.id}`),
        messageCount: count(messages.id),
      })
      .from(conversations)
      .leftJoin(messages, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.jobId, jobId)),
  ]);

  const latestDispatch = dispatchRows[0] ?? null;
  const latestAssignment = assignmentRows[0] ?? null;

  const routerUser = latestDispatch?.routerUserId
    ? (
        await db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role })
          .from(users)
          .where(eq(users.id, latestDispatch.routerUserId))
          .limit(1)
      )[0] ?? null
    : null;

  const contractorUser = contractorUserRows[0] ?? null;
  const contractor = contractorUser
    ? toParty(contractorUser)
    : latestAssignment
      ? {
          id: latestAssignment.contractorId,
          name: latestAssignment.contractorBusinessName,
          email: latestAssignment.contractorEmail,
          role: "CONTRACTOR",
        }
      : null;

  const statusRaw = String(row.status ?? "");
  const displayStatus = deriveDisplayStatus({
    is_mock: Boolean(row.is_mock),
    status: statusRaw,
    router_approved_at: row.router_approved_at,
  });

  const job: AdminJobDetail = {
    id: row.id,
    title: row.title,
    description: row.scope,
    scope: row.scope,
    tradeCategory: String(row.trade_category ?? ""),
    country: String(row.country ?? ""),
    regionCode: row.region_code,
    city: row.city,
    postalCode: row.postal_code,
    addressFull: row.address_full,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    statusRaw,
    displayStatus,
    routingStatus: String(row.routing_status ?? ""),
    isMock: Boolean(row.is_mock),
    jobSource: String(row.job_source ?? ""),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    publishedAt: toIso(row.published_at),
    archived: Boolean(row.archived),
    paymentState: buildPaymentState(row),
    amountCents: Number(row.amount_cents ?? 0),
    paymentStatus: row.payment_status,
    payoutStatus: row.payout_status,
    jobPoster: row.poster_id
      ? {
          id: row.poster_id,
          name: row.poster_name,
          email: row.poster_email,
          role: row.poster_role,
        }
      : null,
    router: toParty(routerUser),
    contractor,
  };

  const timeline: AdminTimelineEvent[] = [];

  pushTimeline(timeline, row.created_at, "created", "Job created", "job");
  pushTimeline(timeline, row.published_at, "published", "Job published", "job");
  pushTimeline(timeline, row.accepted_at, "accepted", "Payment authorized", "job");
  pushTimeline(timeline, row.funded_at, "funded", "Funds secured", "job");
  pushTimeline(timeline, row.first_routed_at, "first_routed", "First routed", "job");
  pushTimeline(timeline, row.routed_at, "routed", "Routed", "job");
  pushTimeline(timeline, row.contractor_completed_at, "contractor_completed", "Contractor completed", "job");
  pushTimeline(timeline, row.customer_approved_at, "customer_approved", "Customer approved", "job");
  pushTimeline(timeline, row.customer_rejected_at, "customer_rejected", "Customer rejected", "job");
  pushTimeline(timeline, row.router_approved_at, "router_approved", "Router approved", "job");
  pushTimeline(timeline, row.completion_flagged_at, "completion_flagged", "Completion flagged", "job");
  pushTimeline(timeline, row.released_at, "released", "Payout released", "job");
  pushTimeline(timeline, row.refunded_at, "refunded", "Refunded", "job");

  for (const dispatch of dispatchRows) {
    pushTimeline(
      timeline,
      dispatch.createdAt,
      `dispatch_${String(dispatch.status).toLowerCase()}`,
      `Dispatch ${dispatch.status}`,
      "dispatch",
      null,
      dispatch.routerUserId ?? null,
    );
    pushTimeline(
      timeline,
      dispatch.respondedAt,
      `dispatch_${String(dispatch.status).toLowerCase()}_responded`,
      `Dispatch response ${dispatch.status}`,
      "dispatch",
      null,
      dispatch.routerUserId ?? null,
    );
  }

  for (const assignment of assignmentRows) {
    pushTimeline(
      timeline,
      assignment.createdAt,
      `assignment_${String(assignment.status).toLowerCase()}`,
      `Assignment ${assignment.status}`,
      "assignment",
      assignment.contractorBusinessName ?? null,
      assignment.contractorId,
    );
    pushTimeline(
      timeline,
      assignment.completedAt,
      "assignment_completed",
      "Assignment completed",
      "assignment",
      assignment.contractorBusinessName ?? null,
      assignment.contractorId,
    );
  }

  for (const log of auditRows) {
    pushTimeline(
      timeline,
      log.createdAt,
      `audit_${String(log.action).toLowerCase()}`,
      `Audit: ${log.action}`,
      "audit",
      null,
      log.actorUserId ?? null,
    );
  }

  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const related: AdminJobRelated = {
    pmRequests: {
      count: Number(pmRows[0]?.count ?? 0),
      latest: toIso(pmRows[0]?.latest ?? null),
    },
    receipts: {
      count: Number(receiptRows[0]?.count ?? 0),
      latest: toIso(receiptRows[0]?.latest ?? null),
    },
    messages: {
      threadCount: Number(messageStats[0]?.threadCount ?? 0),
      messageCount: Number(messageStats[0]?.messageCount ?? 0),
    },
  };

  return { job, timeline, related };
}
