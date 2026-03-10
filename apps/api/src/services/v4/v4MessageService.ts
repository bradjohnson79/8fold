import { and, asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
import { contractorAccounts } from "@/db/schema/contractorAccount";
import { contractorProfilesV4 } from "@/db/schema/contractorProfileV4";
import { jobPosterProfilesV4 } from "@/db/schema/jobPosterProfileV4";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { v4Messages } from "@/db/schema/v4Message";
import { jobs } from "@/db/schema/job";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";

export type ThreadSummary = {
  id: string;
  jobId: string;
  jobTitle: string | null;
  jobPosterUserId: string;
  contractorUserId: string;
  status: string;
  endedAt: string | null;
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
  appointmentAt?: string | null;
  appointmentAcceptedAt?: string | null;
};

export type MessageRow = {
  id: string;
  threadId: string | null;
  jobId: string;
  fromUserId: string | null;
  toUserId: string | null;
  senderRole: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

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

function mapThreadBase<T extends {
  id: string;
  jobId: string;
  jobTitle: string | null;
  jobPosterUserId: string;
  contractorUserId: string;
  status: string;
  endedAt: Date | null;
  lastMessageAt: Date;
  jobStatus: string | null;
  jobDescription: string | null;
  tradeCategory: string | null;
  availability: unknown;
  timeWindow: string | null;
  appointmentAt: Date | null;
  appointmentAcceptedAt: Date | null;
}>(r: T) {
  return {
    id: r.id,
    jobId: r.jobId,
    jobTitle: r.jobTitle ?? null,
    jobPosterUserId: r.jobPosterUserId,
    contractorUserId: r.contractorUserId,
    status: String(r.status ?? "ACTIVE"),
    endedAt: r.endedAt?.toISOString?.() ?? null,
    lastMessageAt: r.lastMessageAt.toISOString(),
    jobStatus: r.jobStatus ?? null,
    jobDescription: r.jobDescription ?? null,
    tradeCategory: r.tradeCategory ?? null,
    availability: toAvailability(r.availability, r.timeWindow),
    appointmentAt: r.appointmentAt?.toISOString?.() ?? null,
    appointmentAcceptedAt: r.appointmentAcceptedAt?.toISOString?.() ?? null,
  };
}

export async function listThreadsForJobPoster(userId: string): Promise<ThreadSummary[]> {
  const rows = await db
    .select({
      id: v4MessageThreads.id,
      jobId: v4MessageThreads.jobId,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
      status: v4MessageThreads.status,
      endedAt: v4MessageThreads.endedAt,
      lastMessageAt: v4MessageThreads.lastMessageAt,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      jobDescription: jobs.scope,
      tradeCategory: jobs.trade_category,
      availability: jobs.availability,
      timeWindow: jobs.time_window,
      appointmentAt: jobs.appointment_at,
      appointmentAcceptedAt: jobs.appointment_accepted_at,
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
    ...mapThreadBase(r),
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

export async function listThreadsForContractor(userId: string): Promise<ThreadSummary[]> {
  const rows = await db
    .select({
      id: v4MessageThreads.id,
      jobId: v4MessageThreads.jobId,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
      status: v4MessageThreads.status,
      endedAt: v4MessageThreads.endedAt,
      lastMessageAt: v4MessageThreads.lastMessageAt,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      jobDescription: jobs.scope,
      tradeCategory: jobs.trade_category,
      availability: jobs.availability,
      timeWindow: jobs.time_window,
      appointmentAt: jobs.appointment_at,
      appointmentAcceptedAt: jobs.appointment_accepted_at,
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
      ...mapThreadBase(r),
      jobPosterFirstName: r.jobPosterFirstName ?? null,
      jobPosterLastName: r.jobPosterLastName ?? null,
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

async function resolveParticipantThread(threadId: string, userId: string) {
  const thread = await db
    .select({
      id: v4MessageThreads.id,
      jobId: v4MessageThreads.jobId,
      status: v4MessageThreads.status,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
    })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const t = thread[0] ?? null;
  if (!t || (t.jobPosterUserId !== userId && t.contractorUserId !== userId)) return null;
  return t;
}

export async function getThreadMessagesByThreadId(threadId: string, userId: string): Promise<MessageRow[]> {
  const thread = await resolveParticipantThread(threadId, userId);
  if (!thread) return [];

  const byThreadRows = await db
    .select({
      id: v4Messages.id,
      threadId: v4Messages.threadId,
      jobId: v4Messages.jobId,
      fromUserId: v4Messages.fromUserId,
      toUserId: v4Messages.toUserId,
      senderRole: v4Messages.senderRole,
      body: v4Messages.body,
      createdAt: v4Messages.createdAt,
      readAt: v4Messages.readAt,
    })
    .from(v4Messages)
    .where(eq(v4Messages.threadId, thread.id))
    .orderBy(asc(v4Messages.createdAt));

  if (byThreadRows.length > 0) {
    return byThreadRows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      jobId: m.jobId,
      fromUserId: m.fromUserId,
      toUserId: m.toUserId,
      senderRole: m.senderRole,
      body: m.body,
      createdAt: m.createdAt,
      readAt: m.readAt,
    }));
  }

  const participants = new Set([thread.jobPosterUserId, thread.contractorUserId]);
  const fallbackRows = await db
    .select({
      id: v4Messages.id,
      threadId: v4Messages.threadId,
      jobId: v4Messages.jobId,
      fromUserId: v4Messages.fromUserId,
      toUserId: v4Messages.toUserId,
      senderRole: v4Messages.senderRole,
      body: v4Messages.body,
      createdAt: v4Messages.createdAt,
      readAt: v4Messages.readAt,
    })
    .from(v4Messages)
    .where(eq(v4Messages.jobId, thread.jobId))
    .orderBy(asc(v4Messages.createdAt));

  return fallbackRows
    .filter((m) => {
      if (!m.fromUserId || !m.toUserId) return false;
      return participants.has(m.fromUserId) && participants.has(m.toUserId);
    })
    .map((m) => ({
      id: m.id,
      threadId: m.threadId,
      jobId: m.jobId,
      fromUserId: m.fromUserId,
      toUserId: m.toUserId,
      senderRole: m.senderRole,
      body: m.body,
      createdAt: m.createdAt,
      readAt: m.readAt,
    }));
}

export async function appendSystemMessage(threadId: string, body: string): Promise<{ id: string }> {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) throw new Error("System message body required");

  const thread = await db
    .select({ id: v4MessageThreads.id, jobId: v4MessageThreads.jobId })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const t = thread[0] ?? null;
  if (!t) throw new Error("Thread not found");

  const id = randomUUID();
  const now = new Date();

  await db.insert(v4Messages).values({
    id,
    threadId: t.id,
    jobId: t.jobId,
    fromUserId: null,
    toUserId: null,
    senderRole: "SYSTEM",
    body: trimmed,
    createdAt: now,
  });

  await db
    .update(v4MessageThreads)
    .set({ lastMessageAt: now })
    .where(eq(v4MessageThreads.id, t.id));

  return { id };
}

/**
 * Append a SYSTEM message to the thread for a given job, with idempotency.
 *
 * The dedupeMarker is embedded as a prefix in the stored body so we can detect
 * if the message was already written (no separate metadata column exists).
 * Silently returns if no thread exists yet or if the message was already sent.
 */
export async function appendSystemMessageByJobId(
  jobId: string,
  body: string,
  dedupeMarker: string,
): Promise<{ id: string } | null> {
  const trimmedBody = String(body ?? "").trim();
  if (!trimmedBody || !dedupeMarker) return null;

  // Find thread for this job
  const threadRows = await db
    .select({ id: v4MessageThreads.id, jobId: v4MessageThreads.jobId })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.jobId, jobId))
    .limit(1);

  const thread = threadRows[0] ?? null;
  if (!thread) return null; // no thread yet — silently skip

  // Idempotency check: look for an existing SYSTEM message with this dedupeMarker embedded
  const markerPrefix = `[dm:${dedupeMarker}]`;
  const existingRows = await db
    .select({ id: v4Messages.id })
    .from(v4Messages)
    .where(
      and(
        eq(v4Messages.threadId, thread.id),
        eq(v4Messages.senderRole, "SYSTEM"),
        sql`${v4Messages.body} LIKE ${`${markerPrefix}%`}`,
      ),
    )
    .limit(1);

  if (existingRows[0]) return { id: existingRows[0].id }; // already sent

  const storedBody = `${markerPrefix} ${trimmedBody}`;
  const id = randomUUID();
  const now = new Date();

  await db.insert(v4Messages).values({
    id,
    threadId: thread.id,
    jobId: thread.jobId,
    fromUserId: null,
    toUserId: null,
    senderRole: "SYSTEM",
    body: storedBody,
    createdAt: now,
  });

  await db
    .update(v4MessageThreads)
    .set({ lastMessageAt: now })
    .where(eq(v4MessageThreads.id, thread.id));

  return { id };
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
      id: v4MessageThreads.id,
      jobId: v4MessageThreads.jobId,
      status: v4MessageThreads.status,
      jobPosterUserId: v4MessageThreads.jobPosterUserId,
      contractorUserId: v4MessageThreads.contractorUserId,
    })
    .from(v4MessageThreads)
    .where(eq(v4MessageThreads.id, threadId))
    .limit(1);

  const t = thread[0] ?? null;
  if (!t) throw new Error("Thread not found");
  if (t.jobPosterUserId !== fromUserId && t.contractorUserId !== fromUserId) {
    throw new Error("Not a participant");
  }
  if (String(t.status ?? "").toUpperCase() === "ENDED") {
    throw Object.assign(new Error("Conversation Ended"), {
      status: 403,
      code: "V4_CONVERSATION_ENDED",
    });
  }

  const toUserId = fromUserId === t.jobPosterUserId ? t.contractorUserId : t.jobPosterUserId;
  const senderRole = fromUserId === t.jobPosterUserId ? "POSTER" : "CONTRACTOR";
  const id = randomUUID();
  const now = new Date();

  await db.insert(v4Messages).values({
    id,
    threadId: t.id,
    jobId: t.jobId,
    fromUserId,
    toUserId,
    senderRole,
    body: trimmed,
    createdAt: now,
  });

  await db
    .update(v4MessageThreads)
    .set({ lastMessageAt: now })
    .where(eq(v4MessageThreads.id, t.id));

  await emitDomainEvent({
    type: "NEW_MESSAGE",
    payload: {
      jobId: t.jobId,
      threadId,
      messageId: id,
      recipientUserId: toUserId,
      recipientRole: fromUserId === t.jobPosterUserId ? "CONTRACTOR" : "JOB_POSTER",
      createdAt: now,
      dedupeKey: `new_message:${id}:${toUserId}`,
    },
  });

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
    status: "ACTIVE",
    endedAt: null,
    lastMessageAt: now,
    createdAt: now,
  });
  return { id };
}
