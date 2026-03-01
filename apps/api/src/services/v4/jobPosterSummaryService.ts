import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobs } from "@/db/schema/job";
import { v4Messages } from "@/db/schema/v4Message";
import { v4PmRequests } from "@/db/schema/v4PmRequest";
import { getJobPosterPaymentStatus } from "./jobPosterPaymentService";

export type JobPosterPostedJob = {
  id: string;
  title: string;
  status: string;
  routingStatus: string;
  amountCents: number;
  createdAt: string;
};

export type JobPosterAssignedContext = {
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  posterAcceptExpiresAt: string | null;
  contractorUserId: string;
  contractorName: string;
  businessName: string;
  tradeCategory: string;
  yearsExperience: number;
  city: string;
  region: string;
  availabilitySummary: string;
};

export type JobPosterSummary = {
  jobsPosted: number;
  fundsSecuredCents: number;
  fundsSecuredLabel: string;
  jobAmountPaidCents: number | null;
  jobAmountPaidLabel: string;
  activePmRequests: number;
  unreadMessages: number;
  paymentConnected: boolean;
  serverTime: string;
  postedJobs: JobPosterPostedJob[];
  assignedContext: JobPosterAssignedContext | null;
};

function toNonEmpty(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function toAvailabilitySummary(raw: unknown, timeWindow: string | null | undefined): string {
  const fromWindow = toNonEmpty(timeWindow);
  if (fromWindow) return fromWindow;
  if (typeof raw === "string" && toNonEmpty(raw)) return toNonEmpty(raw);
  return "Availability not provided";
}

function buildContractorName(input: {
  contactName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  const fromContact = toNonEmpty(input.contactName);
  if (fromContact) return fromContact;
  const fromNames = [toNonEmpty(input.firstName), toNonEmpty(input.lastName)].filter(Boolean).join(" ");
  return fromNames || "Assigned Contractor";
}

export async function getJobPosterSummary(userId: string): Promise<JobPosterSummary> {
  const now = new Date();
  const jobsPostedRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        ne(jobs.status, "DRAFT")
      )
    );

  const jobsPosted = Number(jobsPostedRows[0]?.count ?? 0);

  const fundsRows = await db
    .select({
      total: sql<number>`coalesce(sum(${jobs.amount_cents}), 0)::int`,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        ne(jobs.status, "DRAFT"),
        sql`${jobs.funds_secured_at} is not null`
      )
    );

  const fundsSecuredCents = Number(fundsRows[0]?.total ?? 0);
  const fundsSecuredLabel =
    fundsSecuredCents > 0 ? `$${(fundsSecuredCents / 100).toFixed(2)}` : "—";

  const jobAmountPaidCents: number | null = null;
  const jobAmountPaidLabel = "Coming Soon";

  const pmRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(v4PmRequests)
    .where(and(eq(v4PmRequests.jobPosterUserId, userId), eq(v4PmRequests.status, "PENDING")));

  const activePmRequests = Number(pmRows[0]?.count ?? 0);

  const unreadRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(v4Messages)
    .where(and(eq(v4Messages.toUserId, userId), isNull(v4Messages.readAt)));

  const unreadMessages = Number(unreadRows[0]?.count ?? 0);

  const paymentStatus = await getJobPosterPaymentStatus(userId);

  const postedJobRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      routingStatus: jobs.routing_status,
      amountCents: jobs.amount_cents,
      createdAt: jobs.created_at,
    })
    .from(jobs)
    .where(and(eq(jobs.job_poster_user_id, userId), ne(jobs.status, "DRAFT")))
    .orderBy(desc(jobs.created_at))
    .limit(25);

  const postedJobs: JobPosterPostedJob[] = postedJobRows.map((row) => ({
    id: row.id,
    title: row.title,
    status: String(row.status ?? ""),
    routingStatus: String(row.routingStatus ?? ""),
    amountCents: Number(row.amountCents ?? 0),
    createdAt: row.createdAt ? row.createdAt.toISOString() : "",
  }));

  const assignedRows = await db
    .select({
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      posterAcceptExpiresAt: jobs.poster_accept_expires_at,
      contractorUserId: jobs.contractor_user_id,
      tradeCategory: jobs.trade_category,
      availability: jobs.availability,
      timeWindow: jobs.time_window,
      createdAt: jobs.created_at,
      region: jobs.region,
      contractorContactName: contractorProfilesV4.contactName,
      contractorFirstName: contractorProfilesV4.firstName,
      contractorLastName: contractorProfilesV4.lastName,
      contractorBusinessName: contractorProfilesV4.businessName,
      yearsExperience: contractorProfilesV4.yearsExperience,
      city: contractorProfilesV4.city,
      regionCode: contractorAccounts.regionCode,
    })
    .from(jobs)
    .leftJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, jobs.contractor_user_id))
    .leftJoin(contractorAccounts, eq(contractorAccounts.userId, jobs.contractor_user_id))
    .where(
      and(
        eq(jobs.job_poster_user_id, userId),
        inArray(jobs.status, ["ASSIGNED", "PUBLISHED"] as any),
        sql`${jobs.contractor_user_id} is not null`,
      ),
    )
    .orderBy(desc(jobs.created_at));

  const assignedContext = assignedRows
    .map((row) => ({
      jobId: row.jobId,
      jobTitle: toNonEmpty(row.jobTitle) || "Job",
      jobStatus: String(row.jobStatus ?? ""),
      posterAcceptExpiresAt: row.posterAcceptExpiresAt ? row.posterAcceptExpiresAt.toISOString() : null,
      contractorUserId: toNonEmpty(row.contractorUserId),
      contractorName: buildContractorName({
        contactName: row.contractorContactName,
        firstName: row.contractorFirstName,
        lastName: row.contractorLastName,
      }),
      businessName: toNonEmpty(row.contractorBusinessName) || "Contractor Business",
      tradeCategory: toNonEmpty(row.tradeCategory),
      yearsExperience: Number(row.yearsExperience ?? 0),
      city: toNonEmpty(row.city),
      region: toNonEmpty(row.regionCode) || toNonEmpty(row.region),
      availabilitySummary: toAvailabilitySummary(row.availability, row.timeWindow),
      urgency: (() => {
        const status = String(row.jobStatus ?? "").toUpperCase();
        if (status === "ASSIGNED" && row.posterAcceptExpiresAt instanceof Date) return row.posterAcceptExpiresAt.getTime();
        if (status === "ASSIGNED") return Number.MAX_SAFE_INTEGER - 1;
        return Number.MAX_SAFE_INTEGER;
      })(),
      createdAtMs: row.createdAt instanceof Date ? row.createdAt.getTime() : 0,
    }))
    .filter((row) => Boolean(row.contractorUserId))
    .sort((a, b) => a.urgency - b.urgency || b.createdAtMs - a.createdAtMs)[0] ?? null;

  return {
    jobsPosted,
    fundsSecuredCents,
    fundsSecuredLabel,
    jobAmountPaidCents,
    jobAmountPaidLabel,
    activePmRequests,
    unreadMessages,
    paymentConnected: paymentStatus.connected,
    serverTime: now.toISOString(),
    postedJobs,
    assignedContext: assignedContext
      ? {
          jobId: assignedContext.jobId,
          jobTitle: assignedContext.jobTitle,
          jobStatus: assignedContext.jobStatus,
          posterAcceptExpiresAt: assignedContext.posterAcceptExpiresAt,
          contractorUserId: assignedContext.contractorUserId,
          contractorName: assignedContext.contractorName,
          businessName: assignedContext.businessName,
          tradeCategory: assignedContext.tradeCategory,
          yearsExperience: assignedContext.yearsExperience,
          city: assignedContext.city,
          region: assignedContext.region,
          availabilitySummary: assignedContext.availabilitySummary,
        }
      : null,
  };
}
