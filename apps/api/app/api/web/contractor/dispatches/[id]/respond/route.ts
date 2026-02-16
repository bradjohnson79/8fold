import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { conversations } from "../../../../../../../db/schema/conversation";
import { contractors } from "../../../../../../../db/schema/contractor";
import { jobAssignments } from "../../../../../../../db/schema/jobAssignment";
import { jobDispatches } from "../../../../../../../db/schema/jobDispatch";
import { jobs } from "../../../../../../../db/schema/job";
import { users } from "../../../../../../../db/schema/user";
import { requireContractorReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { generateActionToken, hashActionToken } from "../../../../../../../src/jobs/actionTokens";
import { getOrCreatePlatformUserId } from "../../../../../../../src/system/platformUser";
import { ensureActiveAccountTx } from "../../../../../../../src/server/accountGuard";

const BodySchema = z.object({
  decision: z.enum(["accept", "decline"]),
  estimatedCompletionDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("dispatches");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function toUtcDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export async function POST(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const authed = ready;
    const jobId = getJobIdFromUrl(req);
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      await ensureActiveAccountTx(tx, authed.userId);

      const userRows = await tx.select({ email: users.email }).from(users).where(eq(users.id, authed.userId)).limit(1);
      const email = String(userRows[0]?.email ?? "").trim().toLowerCase();
      if (!email) return { kind: "no_contractor" as const };

      const contractorRows = await tx.select({ id: contractors.id }).from(contractors).where(sql<boolean>`lower(${contractors.email}) = ${email}`).limit(1);
      const contractorId = contractorRows[0]?.id ?? null;
      if (!contractorId) return { kind: "no_contractor" as const };

      const dispatchRows = await tx
        .select({
          id: jobDispatches.id,
          status: jobDispatches.status,
          expiresAt: jobDispatches.expiresAt,
          respondedAt: jobDispatches.respondedAt,
          routerUserId: jobDispatches.routerUserId,
          jobId: jobDispatches.jobId,
          contractorId: jobDispatches.contractorId,

          job_status: jobs.status,
          job_archived: jobs.archived,
          job_claimedByUserId: jobs.claimedByUserId,
          job_jobPosterUserId: jobs.jobPosterUserId,
          job_contractorActionTokenHash: jobs.contractorActionTokenHash,
          job_customerActionTokenHash: jobs.customerActionTokenHash,
          job_estimatedCompletionDate: jobs.estimatedCompletionDate,
          job_estimateSetAt: jobs.estimateSetAt,
        })
        .from(jobDispatches)
        .innerJoin(jobs, eq(jobDispatches.jobId, jobs.id))
        .where(and(eq(jobDispatches.jobId, jobId), eq(jobDispatches.contractorId, contractorId)))
        .orderBy(sql`${jobDispatches.createdAt} desc`)
        .limit(1);
      const dispatch = dispatchRows[0] ?? null;
      if (!dispatch) return { kind: "not_found" as const };
      if (dispatch.status !== "PENDING") return { kind: "already_responded" as const };

      const now = new Date();
      if (dispatch.expiresAt.getTime() <= Date.now()) {
        await tx.update(jobDispatches).set({ status: "EXPIRED", respondedAt: now, updatedAt: now } as any).where(eq(jobDispatches.id, dispatch.id));
        return { kind: "expired" as const };
      }
      if (dispatch.job_archived) return { kind: "job_not_available" as const };
      if (dispatch.job_claimedByUserId !== dispatch.routerUserId) return { kind: "job_not_owned" as const };
      if (!["PUBLISHED", "OPEN_FOR_ROUTING"].includes(String(dispatch.job_status))) return { kind: "job_not_available" as const };

      if (body.data.decision === "decline") {
        await tx.update(jobDispatches).set({ status: "DECLINED", respondedAt: now, updatedAt: now } as any).where(eq(jobDispatches.id, dispatch.id));
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorUserId: authed.userId,
          action: "JOB_DISPATCH_DECLINED",
          entityType: "Job",
          entityId: dispatch.jobId,
          metadata: { dispatchId: dispatch.id, contractorId } as any,
        });
        return { kind: "ok_declined" as const };
      }

      // accept
      const platformAdminUserId = await getOrCreatePlatformUserId(tx as any);

      const contractorToken = generateActionToken();
      const customerToken = generateActionToken();
      const contractorHash = dispatch.job_contractorActionTokenHash ?? hashActionToken(contractorToken);
      const customerHash = dispatch.job_customerActionTokenHash ?? hashActionToken(customerToken);

      const updated = await tx
        .update(jobs)
        .set({ status: "ASSIGNED", contractorActionTokenHash: contractorHash, customerActionTokenHash: customerHash } as any)
        .where(and(eq(jobs.id, dispatch.jobId), inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"] as any)))
        .returning({ id: jobs.id });
      if (updated.length !== 1) return { kind: "job_not_available" as const };

      if (body.data.estimatedCompletionDate && !dispatch.job_estimatedCompletionDate) {
        await tx
          .update(jobs)
          .set({
            estimatedCompletionDate: toUtcDateOnly(body.data.estimatedCompletionDate),
            estimateSetAt: dispatch.job_estimateSetAt ?? now,
            estimateUpdatedAt: null,
            estimateUpdateReason: null,
            estimateUpdateOtherText: null,
          } as any)
          .where(eq(jobs.id, dispatch.jobId));
      }

      // Ensure assignment exists (idempotent-ish).
      const existingAssign = await tx.select({ id: jobAssignments.id }).from(jobAssignments).where(eq(jobAssignments.jobId, dispatch.jobId)).limit(1);
      if (existingAssign.length === 0) {
        await tx.insert(jobAssignments).values({
          id: crypto.randomUUID(),
          jobId: dispatch.jobId,
          contractorId,
          status: "ASSIGNED",
          assignedByAdminUserId: platformAdminUserId,
          createdAt: now,
        } as any);
      }

      await tx.update(jobDispatches).set({ status: "ACCEPTED", respondedAt: now, updatedAt: now } as any).where(eq(jobDispatches.id, dispatch.id));
      await tx
        .update(jobDispatches)
        .set({ status: "EXPIRED", respondedAt: now, updatedAt: now } as any)
        .where(and(eq(jobDispatches.jobId, dispatch.jobId), eq(jobDispatches.status, "PENDING"), ne(jobDispatches.id, dispatch.id)));

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: authed.userId,
        action: "JOB_DISPATCH_ACCEPTED",
        entityType: "Job",
        entityId: dispatch.jobId,
        metadata: { dispatchId: dispatch.id, contractorId } as any,
      });

      // Ensure conversation exists (best-effort but inside tx is fine).
      const jobPosterUserId = dispatch.job_jobPosterUserId ?? null;
      if (jobPosterUserId) {
        await tx
          .insert(conversations)
          .values({
            id: crypto.randomUUID(),
            jobId: dispatch.jobId,
            contractorUserId: authed.userId,
            jobPosterUserId,
            createdAt: now,
            updatedAt: now,
          } as any)
          .onConflictDoNothing({
            target: [conversations.jobId, conversations.contractorUserId, conversations.jobPosterUserId],
          });
      }

      const allowEcho = process.env.ALLOW_DEV_OTP_ECHO === "true";
      const tokensToReturn =
        process.env.NODE_ENV !== "production" && allowEcho && !dispatch.job_contractorActionTokenHash && !dispatch.job_customerActionTokenHash
          ? { contractorToken, customerToken }
          : undefined;

      return { kind: "ok_accepted" as const, tokens: tokensToReturn };
    });

    if (result.kind === "no_contractor") return NextResponse.json({ ok: true, status: "NO_CONTRACTOR_PROFILE" }, { status: 200 });
    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "already_responded") return NextResponse.json({ error: "Already responded" }, { status: 409 });
    if (result.kind === "expired") return NextResponse.json({ error: "Expired" }, { status: 409 });
    if (result.kind === "job_not_owned") return NextResponse.json({ error: "Job not owned by router" }, { status: 409 });
    if (result.kind === "job_not_available") return NextResponse.json({ error: "Job not available" }, { status: 409 });
    if (result.kind === "ok_declined") return NextResponse.json({ ok: true, status: "DECLINED" });
    return NextResponse.json({ ok: true, status: "ACCEPTED", tokens: (result as any).tokens });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

