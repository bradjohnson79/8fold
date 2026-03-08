import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, disputes, ledgerEntries, v4FinancialLedger } from "@/db/schema";
import { escrows } from "@/db/schema/escrow";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["archive", "delete"]),
  jobIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

const auditAuth = (identity: { userId: string; adminRole: string; authSource: "admin_session" }) => ({
  userId: identity.userId,
  role: "ADMIN" as const,
  authSource: identity.authSource as "admin_session",
});

async function canDeleteJob(jobId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [ledgerCount, v4LedgerCount, disputeCount, escrowCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(ledgerEntries).where(eq(ledgerEntries.jobId, jobId)),
    db.select({ count: sql<number>`count(*)::int` }).from(v4FinancialLedger).where(eq(v4FinancialLedger.jobId, jobId)),
    db.select({ count: sql<number>`count(*)::int` }).from(disputes).where(eq(disputes.jobId, jobId)),
    db.select({ count: sql<number>`count(*)::int` }).from(escrows).where(eq(escrows.jobId, jobId)),
  ]);

  if (Number(ledgerCount[0]?.count ?? 0) > 0) return { ok: false, reason: "Ledger entries exist" };
  if (Number(v4LedgerCount[0]?.count ?? 0) > 0) return { ok: false, reason: "v4 financial ledger entries exist" };
  if (Number(disputeCount[0]?.count ?? 0) > 0) return { ok: false, reason: "Disputes exist" };
  if (Number(escrowCount[0]?.count ?? 0) > 0) return { ok: false, reason: "Escrow records exist" };

  const jobRows = await db
    .select({ stripeCapturedAt: jobs.stripe_captured_at })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (jobRows[0]?.stripeCapturedAt != null) {
    return { ok: false, reason: "Stripe funds captured" };
  }

  return { ok: true };
}

export async function POST(req: Request): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const bodyRaw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(bodyRaw);
    if (!parsed.success) {
      return err(400, "ADMIN_SUPER_JOBS_BULK_INVALID", "Invalid payload: action must be archive or delete, jobIds required");
    }

    const { action, jobIds } = parsed.data;
    const uniqueIds = [...new Set(jobIds)];

    if (action === "archive") {
      const now = new Date();
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

      const count = updated.length;
      for (const id of uniqueIds) {
        await adminAuditLog(req, auditAuth(identity), {
          action: "JOB_ARCHIVED",
          entityType: "Job",
          entityId: id,
          metadata: { archived_by_admin_id: identity.userId },
        });
      }
      return ok({ archived: count, failed: uniqueIds.length - count });
    }

    // action === "delete"
    let deleted = 0;
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of uniqueIds) {
      try {
        const existing = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1);
        if (!existing[0]) {
          failed.push({ id, reason: "Job not found" });
          continue;
        }

        const deleteCheck = await canDeleteJob(id);
        if (!deleteCheck.ok) {
          failed.push({ id, reason: deleteCheck.reason });
          continue;
        }

        await adminAuditLog(req, auditAuth(identity), {
          action: "JOB_DELETED",
          entityType: "Job",
          entityId: id,
          metadata: {
            deleted_by_admin_id: identity.userId,
            deleted_reason: "bulk delete",
            deleted_at: new Date().toISOString(),
          },
        });

        await db.delete(jobs).where(eq(jobs.id, id));
        deleted++;
      } catch (jobErr) {
        const reason = jobErr instanceof Error ? jobErr.message : String(jobErr);
        console.error("[ADMIN_SUPER_JOBS_BULK_JOB_ERROR]", { jobId: id, error: reason });
        failed.push({ id, reason });
      }
    }

    return ok({ deleted, failed: failed.length, failedDetails: failed });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const errStack = e instanceof Error ? e.stack : undefined;
    console.error("[ADMIN_SUPER_JOBS_BULK_ERROR]", {
      message: errMsg,
      stack: errStack,
      name: e instanceof Error ? e.name : undefined,
    });
    return err(500, "ADMIN_SUPER_JOBS_BULK_FAILED", "Failed to execute bulk action");
  }
}
