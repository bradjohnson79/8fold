import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/drizzle";
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
    })
    .from(v4MessageThreads)
    .innerJoin(jobs, eq(jobs.id, v4MessageThreads.jobId))
    .where(eq(v4MessageThreads.jobPosterUserId, userId))
    .orderBy(desc(v4MessageThreads.lastMessageAt));

  return rows.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    jobTitle: r.jobTitle ?? null,
    jobPosterUserId: r.jobPosterUserId,
    contractorUserId: r.contractorUserId,
    lastMessageAt: r.lastMessageAt.toISOString(),
  }));
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
