import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema/job";
import { v4Messages } from "@/db/schema/v4Message";
import { v4MessageThreads } from "@/db/schema/v4MessageThread";
import { v4JobAssignments } from "@/db/schema/v4JobAssignment";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { v4Notifications } from "@/db/schema/v4Notification";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = ["ARCHIVE", "UNARCHIVE", "DELETE_SOFT", "DELETE_TEST_ONLY"] as const;
type BulkAction = (typeof ALLOWED_ACTIONS)[number];

const BodySchema = z.object({
  action: z.enum(ALLOWED_ACTIONS),
  jobIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

const auditAuth = (identity: { userId: string; adminRole: string; authSource: "admin_session" }) => ({
  userId: identity.userId,
  role: "ADMIN" as const,
  authSource: identity.authSource as "admin_session",
});

export async function POST(req: Request): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return err(400, "ADMIN_BULK_INVALID_JSON", "Invalid JSON body");
  }

  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return err(
      400,
      "ADMIN_BULK_INVALID",
      "Invalid payload: action must be ARCHIVE, UNARCHIVE, DELETE_SOFT, or DELETE_TEST_ONLY; jobIds required (1–100 items)",
    );
  }

  const { action, jobIds } = parsed.data;
  const uniqueIds = [...new Set(jobIds)];
  const now = new Date();

  let processed = 0;
  let skipped = 0;

  try {
    // ── ARCHIVE ──────────────────────────────────────────────────────────────
    if (action === "ARCHIVE") {
      const updated = await db
        .update(jobs)
        .set({
          archived: true,
          archived_at: now,
          archived_by_admin_id: identity.userId,
          updated_at: now,
        } as any)
        .where(and(inArray(jobs.id, uniqueIds), eq(jobs.archived, false)))
        .returning({ id: jobs.id });

      processed = updated.length;
      skipped = uniqueIds.length - processed;

      console.log("[admin-bulk-action]", {
        adminUserId: identity.userId,
        action,
        jobIds: uniqueIds,
        processed,
        skipped,
      });

      await adminAuditLog(req, auditAuth(identity), {
        action: "JOBS_BULK_ARCHIVED",
        entityType: "Job",
        entityId: "bulk",
        metadata: { jobIds: uniqueIds, processed, skipped },
      });

      return ok({ success: true, action, processed, skipped, jobIds: uniqueIds });
    }

    // ── UNARCHIVE ─────────────────────────────────────────────────────────────
    if (action === "UNARCHIVE") {
      const updated = await db
        .update(jobs)
        .set({
          archived: false,
          archived_at: null,
          updated_at: now,
        } as any)
        .where(and(inArray(jobs.id, uniqueIds), eq(jobs.archived, true)))
        .returning({ id: jobs.id });

      processed = updated.length;
      skipped = uniqueIds.length - processed;

      console.log("[admin-bulk-action]", {
        adminUserId: identity.userId,
        action,
        jobIds: uniqueIds,
        processed,
        skipped,
      });

      await adminAuditLog(req, auditAuth(identity), {
        action: "JOBS_BULK_UNARCHIVED",
        entityType: "Job",
        entityId: "bulk",
        metadata: { jobIds: uniqueIds, processed, skipped },
      });

      return ok({ success: true, action, processed, skipped, jobIds: uniqueIds });
    }

    // ── DELETE_SOFT ───────────────────────────────────────────────────────────
    // Jobs remain in the database for audit, payments, and disputes.
    // Soft delete = mark archived so they vanish from normal queries.
    if (action === "DELETE_SOFT") {
      const updated = await db
        .update(jobs)
        .set({
          archived: true,
          archived_at: now,
          archived_by_admin_id: identity.userId,
          updated_at: now,
        } as any)
        .where(inArray(jobs.id, uniqueIds))
        .returning({ id: jobs.id });

      processed = updated.length;
      skipped = uniqueIds.length - processed;

      console.log("[admin-bulk-action]", {
        adminUserId: identity.userId,
        action,
        jobIds: uniqueIds,
        processed,
        skipped,
      });

      await adminAuditLog(req, auditAuth(identity), {
        action: "JOBS_BULK_SOFT_DELETED",
        entityType: "Job",
        entityId: "bulk",
        metadata: { jobIds: uniqueIds, processed, skipped, softDelete: true },
      });

      return ok({ success: true, action, processed, skipped, jobIds: uniqueIds });
    }

    // ── DELETE_TEST_ONLY ──────────────────────────────────────────────────────
    // Hard deletes ONLY jobs where is_mock = true. Real jobs are skipped.
    // Cascades child rows first to avoid FK violations.
    if (action === "DELETE_TEST_ONLY") {
      const mockJobRows = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(inArray(jobs.id, uniqueIds), eq(jobs.is_mock, true)));

      const mockIds = mockJobRows.map((j) => j.id);
      skipped = uniqueIds.length - mockIds.length;

      if (mockIds.length > 0) {
        await db.transaction(async (tx) => {
          // 1. Fetch thread IDs for these jobs so we can delete messages
          const threads = await tx
            .select({ id: v4MessageThreads.id })
            .from(v4MessageThreads)
            .where(inArray(v4MessageThreads.jobId, mockIds));

          const threadIds = threads.map((t) => t.id);

          // 2. Delete messages (thread FK → cascade, but explicit for safety)
          if (threadIds.length > 0) {
            await tx.delete(v4Messages).where(inArray(v4Messages.threadId, threadIds));
          }

          // 3. Delete message threads
          await tx.delete(v4MessageThreads).where(inArray(v4MessageThreads.jobId, mockIds));

          // 4. Delete job assignments
          await tx.delete(v4JobAssignments).where(inArray(v4JobAssignments.jobId, mockIds));

          // 5. Delete contractor invites
          await tx.delete(v4ContractorJobInvites).where(inArray(v4ContractorJobInvites.jobId, mockIds));

          // 6. Delete notifications keyed by job entity_id
          await tx.delete(v4Notifications).where(inArray(v4Notifications.entityId, mockIds));

          // 7. Delete event outbox entries referencing these jobs (JSON payload)
          for (const jobId of mockIds) {
            await tx.execute(
              sql`DELETE FROM v4_event_outbox WHERE payload->>'jobId' = ${jobId}`,
            );
          }

          // 8. Hard delete the mock jobs (guard: is_mock = true enforced again)
          await tx
            .delete(jobs)
            .where(and(inArray(jobs.id, mockIds), eq(jobs.is_mock, true)));
        });

        processed = mockIds.length;
      }

      console.log("[admin-bulk-action]", {
        adminUserId: identity.userId,
        action,
        jobIds: uniqueIds,
        mockIds,
        processed,
        skipped,
      });

      await adminAuditLog(req, auditAuth(identity), {
        action: "JOBS_BULK_HARD_DELETED_MOCK",
        entityType: "Job",
        entityId: "bulk",
        metadata: { jobIds: uniqueIds, mockIds, processed, skipped },
      });

      return ok({ success: true, action, processed, skipped, jobIds: uniqueIds });
    }

    // Unreachable — zod guards this
    return err(400, "ADMIN_BULK_UNKNOWN_ACTION", "Unknown action");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[admin-bulk-action] error", {
      adminUserId: identity.userId,
      action,
      jobIds: uniqueIds,
      error: msg,
      stack,
    });
    return err(500, "ADMIN_BULK_FAILED", "Bulk action failed");
  }
}
