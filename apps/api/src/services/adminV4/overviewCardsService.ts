import { and, asc, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db/drizzle";
import {
  jobs,
  users,
  v4AdminDisputes,
  v4AdminSupportTickets,
} from "@/db/schema";

export type RevenueRangeKey = "24h" | "7d" | "30d" | "60d" | "90d";

type RegionFilterKey =
  | "latestJobsRegion"
  | "overdueRoutingRegion"
  | "newestJobPostersRegion"
  | "newestContractorsRegion"
  | "newestRoutersRegion"
  | "payoutsPendingRegion"
  | "payoutsPaidRegion";

type RevenueRangeFilterKey = "contractorRevenueRange" | "routerRevenueRange" | "platformRevenueRange";

export type OverviewCardsFilters = {
  latestJobsRegion: string;
  overdueRoutingRegion: string;
  newestJobPostersRegion: string;
  newestContractorsRegion: string;
  newestRoutersRegion: string;
  payoutsPendingRegion: string;
  payoutsPaidRegion: string;
  contractorRevenueRange: RevenueRangeKey;
  routerRevenueRange: RevenueRangeKey;
  platformRevenueRange: RevenueRangeKey;
};

type RevenueSummary = { totalCents: number; jobsCount: number };

export type OverviewCardsPayload = {
  filters: {
    selected: OverviewCardsFilters;
    regionOptions: string[];
  };
  latestJobs: Array<{
    jobId: string;
    jobTitle: string | null;
    city: string | null;
    regionCode: string | null;
    status: string;
    postedAt: string | null;
  }>;
  overdueRouting: Array<{
    jobId: string;
    jobTitle: string | null;
    city: string | null;
    regionCode: string | null;
    postedAt: string | null;
    assignedRouterName: string | null;
  }>;
  openSupportMessages: Array<{
    ticketId: string;
    category: string;
    userRole: string;
    createdAt: string;
    status: string;
  }>;
  openDisputes: Array<{
    disputeId: string;
    jobId: string;
    userRole: string;
    createdAt: string;
    status: string;
  }>;
  newestJobPosters: Array<{
    userId: string;
    name: string | null;
    city: string | null;
    regionCode: string | null;
    joinedAt: string;
  }>;
  newestContractors: Array<{
    userId: string;
    name: string | null;
    trade: string | null;
    city: string | null;
    regionCode: string | null;
    joinedAt: string;
  }>;
  newestRouters: Array<{
    userId: string;
    name: string | null;
    region: string | null;
    joinedAt: string;
  }>;
  payoutsPending: Array<{
    jobId: string;
    jobTitle: string | null;
    contractor: string | null;
    amountCents: number;
    inProgressSince: string | null;
  }>;
  payoutsPaid: Array<{
    jobId: string;
    jobTitle: string | null;
    contractor: string | null;
    amountCents: number;
    paidAt: string | null;
  }>;
  revenue: {
    contractor: RevenueSummary;
    router: RevenueSummary;
    platform: RevenueSummary & {
      topJobs: Array<{
        jobId: string;
        jobTitle: string | null;
        city: string | null;
        regionCode: string | null;
        amountCents: number;
        paidAt: string | null;
      }>;
    };
  };
};

const OPEN_SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS"];
const CLOSED_DISPUTE_STATUSES = ["DECIDED", "CLOSED"];
const IN_PROGRESS_JOB_STATUSES = ["ASSIGNED", "IN_PROGRESS"];
const RANGE_TO_HOURS: Record<RevenueRangeKey, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "60d": 24 * 60,
  "90d": 24 * 90,
};
const REGION_KEYS: RegionFilterKey[] = [
  "latestJobsRegion",
  "overdueRoutingRegion",
  "newestJobPostersRegion",
  "newestContractorsRegion",
  "newestRoutersRegion",
  "payoutsPendingRegion",
  "payoutsPaidRegion",
];
const REVENUE_KEYS: RevenueRangeFilterKey[] = ["contractorRevenueRange", "routerRevenueRange", "platformRevenueRange"];
const MAX_ITEMS = 15;

function asIso(v: Date | null | undefined): string | null {
  return v ? v.toISOString() : null;
}

function normalizeRegion(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim().toUpperCase();
  if (!value || value === "ALL") return "ALL";
  return value;
}

function normalizeRevenueRange(raw: string | null | undefined): RevenueRangeKey {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "24h" || value === "7d" || value === "30d" || value === "60d" || value === "90d") return value;
  return "30d";
}

function sinceForRange(range: RevenueRangeKey): Date {
  const hours = RANGE_TO_HOURS[range] ?? RANGE_TO_HOURS["30d"];
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function regionWhere(
  selectedRegion: string,
  regionExpr: ReturnType<typeof sql<string | null>>,
): ReturnType<typeof sql> | undefined {
  if (selectedRegion === "ALL") return undefined;
  return sql`upper(coalesce(${regionExpr}, '')) = ${selectedRegion}`;
}

export function parseOverviewCardsFilters(searchParams: URLSearchParams): OverviewCardsFilters {
  const base: OverviewCardsFilters = {
    latestJobsRegion: "ALL",
    overdueRoutingRegion: "ALL",
    newestJobPostersRegion: "ALL",
    newestContractorsRegion: "ALL",
    newestRoutersRegion: "ALL",
    payoutsPendingRegion: "ALL",
    payoutsPaidRegion: "ALL",
    contractorRevenueRange: "30d",
    routerRevenueRange: "30d",
    platformRevenueRange: "30d",
  };

  for (const key of REGION_KEYS) {
    base[key] = normalizeRegion(searchParams.get(key));
  }
  for (const key of REVENUE_KEYS) {
    base[key] = normalizeRevenueRange(searchParams.get(key));
  }

  return base;
}

async function listRegionOptions(): Promise<string[]> {
  try {
    const rows = await db.execute(sql`
      select distinct upper(region_code) as code
      from (
        select nullif(trim(${jobs.region_code}), '') as region_code from ${jobs}
        union
        select nullif(trim(${jobs.state_code}), '') as region_code from ${jobs}
        union
        select nullif(trim(${users.stateCode}), '') as region_code from ${users}
      ) all_regions
      where region_code is not null
      order by code asc
    `);

    const values = (rows.rows as Array<{ code: string | null }>).map((r) => String(r.code ?? "").trim()).filter(Boolean);
    return ["ALL", ...values];
  } catch {
    return ["ALL"];
  }
}

async function listLatestJobs(selectedRegion: string) {
  const regionExpr = sql<string | null>`coalesce(${jobs.region_code}, ${jobs.state_code})`;
  const rows = await db
    .select({
      jobId: jobs.id,
      jobTitle: jobs.title,
      city: jobs.city,
      regionCode: regionExpr,
      status: jobs.status,
      postedAt: jobs.posted_at,
    })
    .from(jobs)
    .where(regionWhere(selectedRegion, regionExpr))
    .orderBy(desc(jobs.posted_at))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    city: r.city,
    regionCode: r.regionCode,
    status: String(r.status ?? ""),
    postedAt: asIso(r.postedAt),
  }));
}

async function listOverdueRouting(selectedRegion: string) {
  const routerUser = alias(users, "router_user");
  const regionExpr = sql<string | null>`coalesce(${jobs.region_code}, ${jobs.state_code})`;
  const overdueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      jobId: jobs.id,
      jobTitle: jobs.title,
      city: jobs.city,
      regionCode: regionExpr,
      postedAt: jobs.posted_at,
      assignedRouterName: routerUser.name,
    })
    .from(jobs)
    .leftJoin(routerUser, eq(routerUser.id, jobs.admin_routed_by_id))
    .where(
      and(
        lteSafe(jobs.posted_at, overdueCutoff),
        sql`(${jobs.first_routed_at} is null or ${jobs.routing_status} = 'UNROUTED')`,
        regionWhere(selectedRegion, regionExpr),
      ),
    )
    .orderBy(asc(jobs.posted_at))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    city: r.city,
    regionCode: r.regionCode,
    postedAt: asIso(r.postedAt),
    assignedRouterName: r.assignedRouterName ?? null,
  }));
}

async function listOpenSupportMessages() {
  const rows = await db
    .select({
      ticketId: v4AdminSupportTickets.id,
      category: v4AdminSupportTickets.category,
      userRole: v4AdminSupportTickets.roleContext,
      createdAt: v4AdminSupportTickets.createdAt,
      status: v4AdminSupportTickets.status,
    })
    .from(v4AdminSupportTickets)
    .where(inArray(v4AdminSupportTickets.status, OPEN_SUPPORT_STATUSES as any))
    .orderBy(desc(v4AdminSupportTickets.createdAt))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    ticketId: r.ticketId,
    category: r.category,
    userRole: r.userRole,
    createdAt: asIso(r.createdAt) ?? "",
    status: r.status,
  }));
}

async function listOpenDisputes() {
  const rows = await db
    .select({
      disputeId: v4AdminDisputes.id,
      jobId: v4AdminDisputes.jobId,
      userRole: v4AdminDisputes.againstRole,
      createdAt: v4AdminDisputes.createdAt,
      status: v4AdminDisputes.status,
    })
    .from(v4AdminDisputes)
    .where(notInArray(v4AdminDisputes.status, CLOSED_DISPUTE_STATUSES as any))
    .orderBy(desc(v4AdminDisputes.createdAt))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    disputeId: r.disputeId,
    jobId: r.jobId,
    userRole: r.userRole,
    createdAt: asIso(r.createdAt) ?? "",
    status: r.status,
  }));
}

async function listNewestJobPosters(selectedRegion: string) {
  const regionExpr = sql<string | null>`coalesce(${users.stateCode}, '')`;
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      city: users.legalCity,
      regionCode: regionExpr,
      joinedAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.role, "JOB_POSTER" as any), regionWhere(selectedRegion, regionExpr)))
    .orderBy(desc(users.createdAt))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    city: r.city,
    regionCode: r.regionCode,
    joinedAt: asIso(r.joinedAt) ?? "",
  }));
}

async function listNewestContractors(selectedRegion: string) {
  const regionExpr = sql<string | null>`coalesce(${users.stateCode}, '')`;
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      trade: sql<string | null>`null`,
      city: users.legalCity,
      regionCode: regionExpr,
      joinedAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.role, "CONTRACTOR" as any), regionWhere(selectedRegion, regionExpr)))
    .orderBy(desc(users.createdAt))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    trade: r.trade ? String(r.trade) : null,
    city: r.city,
    regionCode: r.regionCode,
    joinedAt: asIso(r.joinedAt) ?? "",
  }));
}

async function listNewestRouters(selectedRegion: string) {
  const regionExpr = sql<string | null>`coalesce(${users.stateCode}, '')`;
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      region: regionExpr,
      joinedAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.role, "ROUTER" as any), regionWhere(selectedRegion, regionExpr)))
    .orderBy(desc(users.createdAt))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    region: r.region,
    joinedAt: asIso(r.joinedAt) ?? "",
  }));
}

async function listPayoutsPending(selectedRegion: string) {
  const contractorUser = alias(users, "contractor_user");
  const regionExpr = sql<string | null>`coalesce(${jobs.region_code}, ${jobs.state_code})`;
  const rows = await db
    .select({
      jobId: jobs.id,
      jobTitle: jobs.title,
      contractor: contractorUser.name,
      amountCents: jobs.contractor_payout_cents,
      inProgressSince: sql<Date | null>`coalesce(${jobs.routing_started_at}, ${jobs.accepted_at}, ${jobs.updated_at})`,
    })
    .from(jobs)
    .leftJoin(contractorUser, eq(contractorUser.id, jobs.contractor_user_id))
    .where(
      and(
        inArray(jobs.status, IN_PROGRESS_JOB_STATUSES as any),
        ne(jobs.payout_status, "RELEASED" as any),
        regionWhere(selectedRegion, regionExpr),
      ),
    )
    .orderBy(desc(sql`coalesce(${jobs.routing_started_at}, ${jobs.accepted_at}, ${jobs.updated_at})`))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    contractor: r.contractor ?? null,
    amountCents: Number(r.amountCents ?? 0),
    inProgressSince: asIso(r.inProgressSince),
  }));
}

async function listPayoutsPaid(selectedRegion: string) {
  const contractorUser = alias(users, "contractor_user");
  const regionExpr = sql<string | null>`coalesce(${jobs.region_code}, ${jobs.state_code})`;
  const rows = await db
    .select({
      jobId: jobs.id,
      jobTitle: jobs.title,
      contractor: contractorUser.name,
      amountCents: jobs.contractor_payout_cents,
      paidAt: sql<Date | null>`coalesce(${jobs.released_at}, ${jobs.stripe_paid_at})`,
    })
    .from(jobs)
    .leftJoin(contractorUser, eq(contractorUser.id, jobs.contractor_user_id))
    .where(and(eq(jobs.payout_status, "RELEASED" as any), regionWhere(selectedRegion, regionExpr)))
    .orderBy(desc(sql`coalesce(${jobs.released_at}, ${jobs.stripe_paid_at})`))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    contractor: r.contractor ?? null,
    amountCents: Number(r.amountCents ?? 0),
    paidAt: asIso(r.paidAt),
  }));
}

async function revenueSummary(range: RevenueRangeKey, amountExpr: ReturnType<typeof sql<number>>, positiveOnly = false) {
  const since = sinceForRange(range);
  const paidAtExpr = sql<Date | null>`coalesce(${jobs.released_at}, ${jobs.stripe_paid_at})`;

  const rows = await db
    .select({
      totalCents: sql<number>`coalesce(sum(${amountExpr}), 0)::int`,
      jobsCount: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .where(
      and(
        isNotNullSafe(paidAtExpr),
        gte(paidAtExpr, since),
        positiveOnly ? sql`${amountExpr} > 0` : undefined,
      ),
    );

  return {
    totalCents: Number(rows[0]?.totalCents ?? 0),
    jobsCount: Number(rows[0]?.jobsCount ?? 0),
  };
}

async function listPlatformTopJobs(range: RevenueRangeKey) {
  const since = sinceForRange(range);
  const paidAtExpr = sql<Date | null>`coalesce(${jobs.released_at}, ${jobs.stripe_paid_at})`;
  const regionExpr = sql<string | null>`coalesce(${jobs.region_code}, ${jobs.state_code})`;

  const rows = await db
    .select({
      jobId: jobs.id,
      jobTitle: jobs.title,
      city: jobs.city,
      regionCode: regionExpr,
      amountCents: jobs.broker_fee_cents,
      paidAt: paidAtExpr,
    })
    .from(jobs)
    .where(and(isNotNullSafe(paidAtExpr), gte(paidAtExpr, since), sql`coalesce(${jobs.broker_fee_cents}, 0) > 0`))
    .orderBy(desc(jobs.broker_fee_cents), desc(paidAtExpr))
    .limit(MAX_ITEMS);

  return rows.map((r) => ({
    jobId: r.jobId,
    jobTitle: r.jobTitle,
    city: r.city,
    regionCode: r.regionCode,
    amountCents: Number(r.amountCents ?? 0),
    paidAt: asIso(r.paidAt),
  }));
}

export async function getOverviewCardsPayload(filters: OverviewCardsFilters): Promise<OverviewCardsPayload> {
  const safe = async <T>(loader: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await loader();
    } catch {
      return fallback;
    }
  };

  const [
    regionOptions,
    latestJobs,
    overdueRouting,
    openSupportMessages,
    openDisputes,
    newestJobPosters,
    newestContractors,
    newestRouters,
    payoutsPending,
    payoutsPaid,
    contractorRevenue,
    routerRevenue,
    platformRevenue,
    platformTopJobs,
  ] = await Promise.all([
    safe(() => listRegionOptions(), ["ALL"]),
    safe(() => listLatestJobs(filters.latestJobsRegion), []),
    safe(() => listOverdueRouting(filters.overdueRoutingRegion), []),
    safe(() => listOpenSupportMessages(), []),
    safe(() => listOpenDisputes(), []),
    safe(() => listNewestJobPosters(filters.newestJobPostersRegion), []),
    safe(() => listNewestContractors(filters.newestContractorsRegion), []),
    safe(() => listNewestRouters(filters.newestRoutersRegion), []),
    safe(() => listPayoutsPending(filters.payoutsPendingRegion), []),
    safe(() => listPayoutsPaid(filters.payoutsPaidRegion), []),
    safe(() => revenueSummary(filters.contractorRevenueRange, sql<number>`coalesce(${jobs.contractor_payout_cents}, 0)`, true), {
      totalCents: 0,
      jobsCount: 0,
    }),
    safe(() => revenueSummary(filters.routerRevenueRange, sql<number>`coalesce(${jobs.router_earnings_cents}, 0)`, true), {
      totalCents: 0,
      jobsCount: 0,
    }),
    safe(() => revenueSummary(filters.platformRevenueRange, sql<number>`coalesce(${jobs.broker_fee_cents}, 0)`, true), {
      totalCents: 0,
      jobsCount: 0,
    }),
    safe(() => listPlatformTopJobs(filters.platformRevenueRange), []),
  ]);

  return {
    filters: {
      selected: filters,
      regionOptions,
    },
    latestJobs,
    overdueRouting,
    openSupportMessages,
    openDisputes,
    newestJobPosters,
    newestContractors,
    newestRouters,
    payoutsPending,
    payoutsPaid,
    revenue: {
      contractor: contractorRevenue,
      router: {
        totalCents: routerRevenue.totalCents,
        jobsCount: routerRevenue.jobsCount,
      },
      platform: {
        totalCents: platformRevenue.totalCents,
        jobsCount: platformRevenue.jobsCount,
        topJobs: platformTopJobs,
      },
    },
  };
}

function lteSafe(column: typeof jobs.posted_at, value: Date) {
  return sql`${column} <= ${value}`;
}

function isNotNullSafe(expr: ReturnType<typeof sql<Date | null>>) {
  return sql`${expr} is not null`;
}
