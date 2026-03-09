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
  admins,
  auditLogs,
  contractors,
  conversations,
  jobAssignments,
  jobDispatches,
  jobs,
  ledgerEntries,
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
  stripe_paid_at: Date | null;
  stripe_refunded_at: Date | null;
  refunded_at: Date | null;
}) {
  const paymentStatus = String(row.payment_status ?? "").toUpperCase();
  const paid = Boolean(row.stripe_paid_at || paymentStatus === "FUNDS_SECURED" || paymentStatus === "FUNDED");
  const refunded = Boolean(row.stripe_refunded_at || row.refunded_at || paymentStatus === "REFUNDED");
  const label = refunded ? "REFUNDED" : paid ? "PAID" : "UNPAID";

  return {
    paid,
    refunded,
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
  if (row.status === "OPEN_FOR_ROUTING") return "CUSTOMER_APPROVED_AWAITING_ROUTER";
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
      where.push(eq(jobs.status, "OPEN_FOR_ROUTING" as any));
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
        stripe_paid_at: jobs.stripe_paid_at,
        stripe_refunded_at: jobs.stripe_refunded_at,
        refunded_at: jobs.refunded_at,
        routing_status: jobs.routing_status,
        trade_category: jobs.trade_category,
        archived: jobs.archived,
        router_approved_at: jobs.router_approved_at,
        job_source: jobs.job_source,
        contractor_user_id: jobs.contractor_user_id,
        claimed_by_user_id: jobs.claimed_by_user_id,
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

  // Collect router IDs from dispatches first, then fall back to jobs.claimed_by_user_id for V4-routed jobs.
  const dispatchRouterIds = Array.from(latestDispatchByJob.values()).map((d) => d.routerUserId).filter(Boolean);
  const claimedRouterIds = jobRows.map((r) => r.claimed_by_user_id).filter((v): v is string => Boolean(v));
  const routerUserIds = Array.from(new Set([...dispatchRouterIds, ...claimedRouterIds]));
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

    const resolvedRouterId = dispatch?.routerUserId ?? row.claimed_by_user_id ?? null;
    const routerSummary = resolvedRouterId ? toParty(routerUserMap.get(resolvedRouterId) ?? null) : null;

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
      appraisal_subtotal_cents: jobs.appraisal_subtotal_cents,
      regional_fee_cents: jobs.regional_fee_cents,
      tax_rate_bps: jobs.tax_rate_bps,
      tax_amount_cents: jobs.tax_amount_cents,
      total_amount_cents: jobs.total_amount_cents,
      province: jobs.province,
      payment_status: jobs.payment_status,
      payout_status: jobs.payout_status,
      stripe_payment_intent_id: jobs.stripe_payment_intent_id,
      stripe_payment_intent_status: jobs.stripe_payment_intent_status,
      stripe_paid_at: jobs.stripe_paid_at,
      stripe_refunded_at: jobs.stripe_refunded_at,
      stripe_canceled_at: jobs.stripe_canceled_at,
      released_at: jobs.released_at,
      refunded_at: jobs.refunded_at,
      labor_total_cents: jobs.labor_total_cents,
      price_adjustment_cents: jobs.price_adjustment_cents,
      transaction_fee_cents: jobs.transaction_fee_cents,
      router_approved_at: jobs.router_approved_at,
      contractor_user_id: jobs.contractor_user_id,
      claimed_by_user_id: jobs.claimed_by_user_id,
      admin_routed_by_id: jobs.admin_routed_by_id,
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

  const [dispatchRows, assignmentRows, contractorUserRows, auditRows, pmRows, receiptRows, messageStats, ledgerSummaryRows] = await Promise.all([
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
    db
      .select({
        type: ledgerEntries.type,
        count: count(),
        creditsCents:
          sql<number>`coalesce(sum(case when ${ledgerEntries.direction} = 'CREDIT' then ${ledgerEntries.amountCents} else 0 end),0)::int`,
        debitsCents:
          sql<number>`coalesce(sum(case when ${ledgerEntries.direction} = 'DEBIT' then ${ledgerEntries.amountCents} else 0 end),0)::int`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.jobId, jobId))
      .groupBy(ledgerEntries.type),
  ]);

  const latestDispatch = dispatchRows[0] ?? null;
  const latestAssignment = assignmentRows[0] ?? null;

  // V4 routing stores the router on jobs.claimed_by_user_id; older dispatch records use jobDispatches.routerUserId.
  // Try dispatch first, then fall back to the claimed_by_user_id snapshot on the job row.
  const routerUserIdResolved = latestDispatch?.routerUserId ?? row.claimed_by_user_id ?? null;
  const routerUser = routerUserIdResolved
    ? (
        await db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role })
          .from(users)
          .where(eq(users.id, routerUserIdResolved))
          .limit(1)
      )[0] ?? null
    : null;

  // Admin-routed jobs: admin_routed_by_id is set and claimed_by_user_id is null (admin not in users table).
  const adminRouter =
    !routerUser && row.admin_routed_by_id
      ? (
          await db
            .select({ id: admins.id, email: admins.email })
            .from(admins)
            .where(eq(admins.id, row.admin_routed_by_id))
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
    financialSummary: {
      appraisalSubtotalCents: Number(row.appraisal_subtotal_cents ?? 0) || Number(row.labor_total_cents ?? 0),
      regionalFeeCents: Number(row.regional_fee_cents ?? 0) || Number(row.price_adjustment_cents ?? 0),
      taxRateBps: Number(row.tax_rate_bps ?? 0),
      taxAmountCents: Number(row.tax_amount_cents ?? 0) || Number(row.transaction_fee_cents ?? 0),
      totalAmountCents: Number(row.total_amount_cents ?? 0) || Number(row.amount_cents ?? 0),
      country: String(row.country ?? ""),
      province: row.province ?? row.region_code ?? null,
      stripePaymentIntentId: row.stripe_payment_intent_id ?? null,
      stripePaymentIntentStatus: row.stripe_payment_intent_status ?? null,
      stripePaidAt: toIso(row.stripe_paid_at),
      stripeRefundedAt: toIso(row.stripe_refunded_at ?? row.refunded_at),
      stripeCanceledAt: toIso(row.stripe_canceled_at),
      ledgerByType: ledgerSummaryRows.map((entry) => ({
        type: String(entry.type ?? ""),
        count: Number(entry.count ?? 0),
        creditsCents: Number(entry.creditsCents ?? 0),
        debitsCents: Number(entry.debitsCents ?? 0),
      })),
    },
    jobPoster: row.poster_id
      ? {
          id: row.poster_id,
          name: row.poster_name,
          email: row.poster_email,
          role: row.poster_role,
        }
      : null,
    router: routerUser
      ? toParty(routerUser)
      : adminRouter
        ? {
            id: adminRouter.id,
            name: `Admin (${adminRouter.email})`,
            email: adminRouter.email,
            role: "ADMIN_OVERRIDE" as string | null,
          }
        : null,
    adminRoutedById: row.admin_routed_by_id ?? null,
    contractor,
  };

  const timeline: AdminTimelineEvent[] = [];

  pushTimeline(timeline, row.created_at, "created", "Job created", "job");
  pushTimeline(timeline, row.published_at, "published", "Job published", "job");
  pushTimeline(timeline, row.stripe_paid_at, "payment_paid", "Payment paid", "job");
  pushTimeline(timeline, row.accepted_at, "accepted", "Contractor accepted", "job");
  pushTimeline(timeline, row.funded_at, "funded", "Funds secured", "job");
  pushTimeline(timeline, row.first_routed_at, "first_routed", "First routed", "job");
  pushTimeline(timeline, row.routed_at, "routed", "Routed", "job");
  pushTimeline(timeline, row.contractor_completed_at, "contractor_completed", "Contractor completed", "job");
  pushTimeline(timeline, row.customer_approved_at, "customer_approved", "Customer approved", "job");
  pushTimeline(timeline, row.customer_rejected_at, "customer_rejected", "Customer rejected", "job");
  pushTimeline(timeline, row.router_approved_at, "router_approved", "Router approved", "job");
  pushTimeline(timeline, row.completion_flagged_at, "completion_flagged", "Completion flagged", "job");
  pushTimeline(timeline, row.released_at, "released", "Payout released", "job");
  pushTimeline(timeline, row.stripe_refunded_at ?? row.refunded_at, "refunded", "Refunded", "job");

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
