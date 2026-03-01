import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { v4Messages } from "@/db/schema/v4Message";
import { jobs } from "@/db/schema/job";

export type ThreadSummary = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  jobPosterUserId: string;
  contractorUserId: string;
  lastMessageAt: string;
  unreadCount?: number;
  jobStatus?: string | null;
  jobDescription?: string | null;
  jobPosterFirstName?: string | null;
  jobPosterLastName?: string | null;
  tradeCategory?: string | null;
  availability?: string | null;
  contractorAmount?: number;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contractorName?: string | null;
  contractorBusinessName?: string | null;
  contractorYearsExperience?: number | null;
  contractorCity?: string | null;
  contractorRegion?: string | null;
};

export type MessageRow = {
  id: string;
  jobId: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

export async function listThreadsForJobPoster(userId: string): Promise<ThreadSummary[]> {
  const rows = await db
    .select({
      id: v4MessageThreads.id,
      jobId: v4MessageThreads.jobId,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
      lastMessageAt: v4MessageThreads.lastMessageAt,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      jobDescription: jobs.scope,
      tradeCategory: jobs.trade_category,
      availability: jobs.availability,
      timeWindow: jobs.time_window,
      contractorName: contractorProfilesV4.contactName,
      contractorBusinessName: contractorProfilesV4.businessName,
      contractorYearsExperience: contractorProfilesV4.yearsExperience,
      contractorCity: contractorProfilesV4.city,
      contractorRegion: contractorAccounts.regionCode,
    })
    .from(v4MessageThreads)
    .innerJoin(jobs, eq(jobs.id, v4MessageThreads.jobId))
    .leftJoin(contractorProfilesV4, eq(contractorProfilesV4.userId, v4MessageThreads.contractorUserId))
    .leftJoin(contractorAccounts, eq(contractorAccounts.userId, v4MessageThreads.contractorUserId))
    .where(eq(v4MessageThreads.jobPosterUserId, userId))
    .orderBy(desc(v4MessageThreads.lastMessageAt));

  return rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    jobTitle: r.jobTitle ?? null,
    jobPosterUserId: r.jobPosterUserId,
    contractorUserId: r.contractorUserId,
    lastMessageAt: r.lastMessageAt.toISOString(),
    jobStatus: r.jobStatus ?? null,
    jobDescription: r.jobDescription ?? null,
    tradeCategory: r.tradeCategory ?? null,
    availability: toAvailability(r.availability, r.timeWindow),
    contractorName: toNonEmpty(r.contractorName) || "Assigned Contractor",
    contractorBusinessName: toNonEmpty(r.contractorBusinessName) || "Contractor Business",
    contractorYearsExperience:
      typeof r.contractorYearsExperience === "number" && Number.isFinite(r.contractorYearsExperience)
        ? r.contractorYearsExperience
        : null,
    contractorCity: toNonEmpty(r.contractorCity) || null,
    contractorRegion: toNonEmpty(r.contractorRegion) || null,
  }));
}

function toNonEmpty(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function toAvailability(raw: unknown, timeWindow: string | null | undefined): string {
  const fromWindow = toNonEmpty(timeWindow);
  if (fromWindow) return fromWindow;
  if (typeof raw === "string") return toNonEmpty(raw);
  if (raw == null) return "";
  try {
    return JSON.stringify(raw);
  } catch {
    return "";
  }
}

function computeContractorAmountCents(input: {
  contractorPayoutCents: number | null;
  totalAmountCents: number | null;
  amountCents: number | null;
}): number {
  const contractorPayoutCents = Number(input.contractorPayoutCents ?? 0);
  if (contractorPayoutCents > 0) return contractorPayoutCents;
  const total = Math.max(Number(input.totalAmountCents ?? 0), Number(input.amountCents ?? 0), 0);
  return Math.round(total * 0.75);
}

export async function listThreadsForContractor(userId: string): Promise<ThreadSummary[]> {
  const rows = await db
    .select({
      id: v4MessageThreads.id,
      jobId: v4MessageThreads.jobId,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
      lastMessageAt: v4MessageThreads.lastMessageAt,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      jobDescription: jobs.scope,
      tradeCategory: jobs.trade_category,
      availability: jobs.availability,
      timeWindow: jobs.time_window,
      contractorPayoutCents: jobs.contractor_payout_cents,
      totalAmountCents: jobs.total_amount_cents,
      amountCents: jobs.amount_cents,
      address: jobs.address_full,
      city: jobs.city,
      region: jobs.region,
      latitude: jobs.lat,
      longitude: jobs.lng,
      jobPosterFirstName: jobPosterProfilesV4.firstName,
      jobPosterLastName: jobPosterProfilesV4.lastName,
    })
    .from(v4MessageThreads)
    .innerJoin(jobs, eq(jobs.id, v4MessageThreads.jobId))
    .leftJoin(jobPosterProfilesV4, eq(jobPosterProfilesV4.userId, v4MessageThreads.jobPosterUserId))
    .where(eq(v4MessageThreads.contractorUserId, userId))
    .orderBy(desc(v4MessageThreads.lastMessageAt));

  return rows.map((r) => {
    const fallbackAddress = [toNonEmpty(r.city), toNonEmpty(r.region)].filter(Boolean).join(", ");
    return {
      id: r.id,
      jobId: r.jobId,
      jobTitle: r.jobTitle ?? null,
      jobPosterUserId: r.jobPosterUserId,
      contractorUserId: r.contractorUserId,
      lastMessageAt: r.lastMessageAt.toISOString(),
      jobStatus: r.jobStatus ?? null,
      jobDescription: r.jobDescription ?? null,
      jobPosterFirstName: r.jobPosterFirstName ?? null,
      jobPosterLastName: r.jobPosterLastName ?? null,
      tradeCategory: r.tradeCategory ?? null,
      availability: toAvailability(r.availability, r.timeWindow),
      contractorAmount: computeContractorAmountCents({
        contractorPayoutCents: r.contractorPayoutCents,
        totalAmountCents: r.totalAmountCents,
        amountCents: r.amountCents,
      }),
      address: toNonEmpty(r.address) || fallbackAddress || null,
      latitude: typeof r.latitude === "number" && Number.isFinite(r.latitude) ? r.latitude : null,
      longitude: typeof r.longitude === "number" && Number.isFinite(r.longitude) ? r.longitude : null,
    };
  });
}

export async function getThreadMessagesByThreadId(threadId: string, userId: string): Promise<MessageRow[]> {
  const thread = await db
    .select({
      jobId: v4MessageThreads.jobId,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
    })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const t = thread[0];
  if (!t || (t.jobPosterUserId !== userId && t.contractorUserId !== userId)) {
    return [];
  }

  const participants = new Set([t.jobPosterUserId, t.contractorUserId]);
  const allMsgs = await db
    .select()
    .from(v4Messages)
    .where(eq(v4Messages.jobId, t.jobId))
    .orderBy(v4Messages.createdAt);

  const filtered = allMsgs.filter(
    (m) => participants.has(m.fromUserId) && participants.has(m.toUserId)
  );

  return filtered.map((m) => ({
    id: m.id,
    jobId: m.jobId,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    body: m.body,
    createdAt: m.createdAt,
    readAt: m.readAt,
  }));
}

export async function sendMessage(
  threadId: string,
  fromUserId: string,
  body: string
): Promise<{ id: string }> {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) throw new Error("Message body required");

  const thread = await db
    .select({
      jobId: v4MessageThreads.jobId,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
    })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const t = thread[0];
  if (!t) throw new Error("Thread not found");
  if (t.jobPosterUserId !== fromUserId && t.contractorUserId !== fromUserId) {
    throw new Error("Not a participant");
  }

  const toUserId = fromUserId === t.jobPosterUserId ? t.contractorUserId : t.jobPosterUserId;
  const id = randomUUID();
  const now = new Date();

  await db.insert(v4Messages).values({
    id,
    jobId: t.jobId,
    fromUserId,
    toUserId,
    body: trimmed,
    createdAt: now,
  });

  await db
    .update(v4MessageThreads)
    .set({ lastMessageAt: now })
    .where(eq(v4MessageThreads.id, threadId));

  return { id };
}

export async function getOrCreateThread(
  jobId: string,
  jobPosterUserId: string,
  contractorUserId: string
): Promise<{ id: string }> {
  const existingRows = await db
    .select({ id: v4MessageThreads.id })
    .from(v4MessageThreads)
    .where(
      and(
        eq(v4MessageThreads.jobId, jobId),
        eq(v4MessageThreads.jobPosterUserId, jobPosterUserId),
        eq(v4MessageThreads.contractorUserId, contractorUserId)
      )
    )
    .limit(1);

  if (existingRows[0]?.id) return { id: existingRows[0].id };

  const id = randomUUID();
  const now = new Date();
  await db.insert(v4MessageThreads).values({
    id,
    jobId,
    jobPosterUserId,
    contractorUserId,
    lastMessageAt: now,
    createdAt: now,
  });
  return { id };
}
