/**
 * Automatically finalizes jobs where:
 * - Contractor submitted a completion report
 * - Job Poster did not respond within 24 hours
 *
 * Runs on a periodic interval from instrumentation.ts.
 */
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4EventOutbox } from "@/db/schema/v4EventOutbox";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { v4Messages } from "@/db/schema/v4Message";

const randomUUID = () => globalThis.crypto.randomUUID();

export async function processCompletionTimeouts(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select({
      id: jobs.id,
      contractorUserId: jobs.contractor_user_id,
      jobPosterUserId: jobs.job_poster_user_id,
      routerUserId: jobs.claimed_by_user_id,
    })
    .from(jobs)
    .where(
      and(
        isNotNull(jobs.contractor_marked_complete_at),
        isNull(jobs.poster_marked_complete_at),
        isNotNull(jobs.completion_window_expires_at),
        lte(jobs.completion_window_expires_at, now),
        isNull(jobs.completed_at),
        sql`${jobs.status} NOT IN ('COMPLETED', 'CANCELLED')`,
      ),
    )
    .limit(20);

  for (const job of expired) {
    try {
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(jobs)
          .set({
            status: "COMPLETED" as any,
            completed_at: now,
            poster_marked_complete_at: now,
            customer_approved_at: now,
            updated_at: now,
          })
          .where(and(eq(jobs.id, job.id), isNull(jobs.completed_at)))
          .returning({ id: jobs.id });

        if (!updated[0]?.id) return;

        await tx.insert(v4EventOutbox).values({
          id: randomUUID(),
          eventType: "JOB_COMPLETED_FINALIZED",
          payload: {
            jobId: job.id,
            contractorId: job.contractorUserId ? String(job.contractorUserId) : null,
            jobPosterId: job.jobPosterUserId ? String(job.jobPosterUserId) : null,
            routerId: job.routerUserId ? String(job.routerUserId) : null,
            createdAt: now.toISOString(),
            dedupeKeyBase: `job_completed_finalized_timeout:${job.id}`,
          } as Record<string, unknown>,
          createdAt: now,
        });

        await tx.insert(v4EventOutbox).values({
          id: randomUUID(),
          eventType: "FUNDS_RELEASE_ELIGIBLE",
          payload: {
            jobId: job.id,
            contractorId: job.contractorUserId ? String(job.contractorUserId) : null,
            jobPosterId: job.jobPosterUserId ? String(job.jobPosterUserId) : null,
            routerId: job.routerUserId ? String(job.routerUserId) : null,
            createdAt: now.toISOString(),
            dedupeKeyBase: `funds_release_eligible_timeout:${job.id}`,
          } as Record<string, unknown>,
          createdAt: now,
        });

        const threads = await tx
          .select({ id: v4MessageThreads.id, jobId: v4MessageThreads.jobId })
          .from(v4MessageThreads)
          .where(eq(v4MessageThreads.jobId, job.id))
          .limit(1);

        const thread = threads[0];
        if (thread) {
          await tx.insert(v4Messages).values({
            id: randomUUID(),
            threadId: thread.id,
            jobId: thread.jobId,
            fromUserId: null,
            toUserId: null,
            senderRole: "SYSTEM",
            body: "Job automatically marked complete after 24 hours. Funds are now releasable.",
            createdAt: now,
          });

          await tx
            .update(v4MessageThreads)
            .set({ status: "ENDED", endedAt: now, lastMessageAt: now })
            .where(eq(v4MessageThreads.id, thread.id));
        }
      });

      console.log("[completion-timeout] auto-completed job", { jobId: job.id });
    } catch (err) {
      console.error("[completion-timeout] failed", {
        jobId: job.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
