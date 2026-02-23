import crypto from "crypto";
import { NextResponse } from "next/server";
import { toHttpError } from "../../../../../src/http/errors";
import { getOrCreatePlatformUserId } from "../../../../../src/system/platformUser";
import { generateActionToken, hashActionToken } from "../../../../../src/jobs/actionTokens";
import { z } from "zod";
import { db } from "../../../../../db/drizzle";
import { conversations } from "../../../../../db/schema/conversation";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractors } from "../../../../../db/schema/contractor";
import { jobAssignments } from "../../../../../db/schema/jobAssignment";
import { jobDispatches } from "../../../../../db/schema/jobDispatch";
import { jobs } from "../../../../../db/schema/job";
import { users } from "../../../../../db/schema/user";
import { and, eq, ne, sql } from "drizzle-orm";
import { ensureActiveAccountTx } from "../../../../../src/server/accountGuard";
import { stripe } from "../../../../../src/payments/stripe";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

const BodySchema = z.object({
  token: z.string().trim().min(8),
  decision: z.enum(["accept", "decline"]),
  // Optional contractor-provided ETC (date-only). Used for router dashboard read-only visibility.
  estimatedCompletionDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function toUtcDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export async function POST(req: Request) {
  try {
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const tokenHash = sha256(body.data.token);

    const result = await db.transaction(async (tx) => {
      const dispatchRows = await tx
        .select({
          id: jobDispatches.id,
          status: jobDispatches.status,
          expiresAt: jobDispatches.expiresAt,
          respondedAt: jobDispatches.respondedAt,
          jobId: jobDispatches.jobId,
          contractorId: jobDispatches.contractorId,
          routerUserId: jobDispatches.routerUserId,

          job_status: jobs.status,
          job_archived: jobs.archived,
          job_paymentStatus: jobs.payment_status,
          job_stripePaymentIntentId: jobs.stripe_payment_intent_id,
          job_authorizationExpiresAt: jobs.authorization_expires_at,
          job_claimedByUserId: jobs.claimed_by_user_id,
          job_jobPosterUserId: jobs.job_poster_user_id,
          job_contractorActionTokenHash: jobs.contractor_action_token_hash,
          job_customerActionTokenHash: jobs.customer_action_token_hash,
          job_estimatedCompletionDate: jobs.estimated_completion_date,
          job_estimateSetAt: jobs.estimate_set_at,
        })
        .from(jobDispatches)
        .innerJoin(jobs, eq(jobDispatches.jobId, jobs.id))
        .where(eq(jobDispatches.tokenHash, tokenHash))
        .limit(1);
      const dispatch = dispatchRows[0] ?? null;
      if (!dispatch) return { kind: "not_found" as const };
      if (dispatch.status !== "PENDING") return { kind: "already_responded" as const };

      const now = new Date();
      if (dispatch.expiresAt.getTime() <= Date.now()) {
        await tx
          .update(jobDispatches)
          .set({ status: "EXPIRED", respondedAt: now, updatedAt: now } as any)
          .where(eq(jobDispatches.id, dispatch.id));
        return { kind: "expired" as const };
      }

      if (dispatch.job_archived) return { kind: "job_not_available" as const };
      if (dispatch.job_claimedByUserId !== dispatch.routerUserId) return { kind: "job_not_owned" as const };
      if (!["PUBLISHED", "OPEN_FOR_ROUTING"].includes(String(dispatch.job_status))) {
        return { kind: "job_not_available" as const };
      }

      // Account guard: if we can resolve a contractor user, enforce account status.
      try {
        const contractorRows = await tx
          .select({ email: contractors.email })
          .from(contractors)
          .where(eq(contractors.id, dispatch.contractorId))
          .limit(1);
        const email = String(contractorRows[0]?.email ?? "").trim().toLowerCase();
        if (email) {
          const userRows = await tx
            .select({ id: users.id })
            .from(users)
            .where(sql<boolean>`lower(${users.email}) = ${email}`)
            .limit(1);
          const contractorUserId = userRows[0]?.id ?? null;
          if (contractorUserId) {
            await ensureActiveAccountTx(tx, contractorUserId);
          }
        }
      } catch {
        // If lookup fails, do not crash dispatch response; downstream auth routes will still enforce.
      }

      if (body.data.decision === "decline") {
        await tx
          .update(jobDispatches)
          .set({ status: "DECLINED", respondedAt: now, updatedAt: now } as any)
          .where(eq(jobDispatches.id, dispatch.id));
        await tx.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorUserId: dispatch.routerUserId,
          action: "JOB_DISPATCH_DECLINED",
          entityType: "Job",
          entityId: dispatch.jobId,
          metadata: { dispatchId: dispatch.id, contractorId: dispatch.contractorId } as any,
        });
        return { kind: "ok_declined" as const };
      }

      // accept
      const platformAdminUserId = await getOrCreatePlatformUserId(tx as any);
      const authorizationExpired =
        dispatch.job_authorizationExpiresAt instanceof Date && dispatch.job_authorizationExpiresAt.getTime() < now.getTime();
      if (authorizationExpired && String(dispatch.job_paymentStatus ?? "").toUpperCase() === "AUTHORIZED") {
        await tx
          .update(jobs)
          .set({
            payment_status: "EXPIRED_UNFUNDED" as any,
            archived: true,
            completion_flag_reason: "AUTHORIZATION_EXPIRED_NO_ACCEPTANCE",
            updated_at: now,
          })
          .where(eq(jobs.id, dispatch.jobId));
        return { kind: "authorization_expired" as const };
      }

      const currentPayment = String(dispatch.job_paymentStatus ?? "").toUpperCase();
      if (currentPayment !== "FUNDS_SECURED") {
        const piId = String(dispatch.job_stripePaymentIntentId ?? "").trim();
        if (!piId || !stripe) return { kind: "payment_not_authorized" as const };
        try {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status === "requires_capture") {
            const captured = await stripe.paymentIntents.capture(piId, undefined, {
              idempotencyKey: `job-accept-capture:${dispatch.jobId}`,
            });
            if (captured.status !== "succeeded") return { kind: "payment_not_authorized" as const };
          } else if (pi.status !== "succeeded") {
            return { kind: "payment_not_authorized" as const };
          }
        } catch {
          return { kind: "payment_not_authorized" as const };
        }
      }

      const contractorToken = generateActionToken();
      const customerToken = generateActionToken();
      const contractorHash = dispatch.job_contractorActionTokenHash ?? hashActionToken(contractorToken);
      const customerHash = dispatch.job_customerActionTokenHash ?? hashActionToken(customerToken);

      const updated = await tx
        .update(jobs)
        .set({
          status: "ASSIGNED",
          contractor_action_token_hash: contractorHash,
          customer_action_token_hash: customerHash,
          payment_status: "FUNDS_SECURED" as any,
          funds_secured_at: now,
          funded_at: now,
          payment_captured_at: now,
          accepted_at: now,
          completion_deadline_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        })
        .where(and(eq(jobs.id, dispatch.jobId), eq(jobs.status, "OPEN_FOR_ROUTING" as any)))
        .returning({ id: jobs.id });
      if (updated.length !== 1) return { kind: "job_not_available" as const };

      if (body.data.estimatedCompletionDate && !dispatch.job_estimatedCompletionDate) {
        await tx
          .update(jobs)
          .set({
            estimated_completion_date: toUtcDateOnly(body.data.estimatedCompletionDate),
            estimate_set_at: dispatch.job_estimateSetAt ?? now,
            estimate_updated_at: null,
            estimate_update_reason: null,
            estimate_update_other_text: null,
          } as any)
          .where(eq(jobs.id, dispatch.jobId));
      }

      await tx.insert(jobAssignments).values({
        id: crypto.randomUUID(),
        jobId: dispatch.jobId,
        contractorId: dispatch.contractorId,
        status: "ASSIGNED",
        assignedByAdminUserId: platformAdminUserId,
        createdAt: now,
      });

      await tx
        .update(jobDispatches)
        .set({ status: "ACCEPTED", respondedAt: now, updatedAt: now } as any)
        .where(eq(jobDispatches.id, dispatch.id));

      await tx
        .update(jobDispatches)
        .set({ status: "EXPIRED", respondedAt: now, updatedAt: now } as any)
        .where(and(eq(jobDispatches.jobId, dispatch.jobId), eq(jobDispatches.status, "PENDING"), ne(jobDispatches.id, dispatch.id)));

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: dispatch.routerUserId,
        action: "JOB_DISPATCH_ACCEPTED",
        entityType: "Job",
        entityId: dispatch.jobId,
        metadata: { dispatchId: dispatch.id, contractorId: dispatch.contractorId } as any,
      });

      const allowEcho = process.env.ALLOW_DEV_OTP_ECHO === "true";
      const tokensToReturn =
        process.env.NODE_ENV !== "production" && allowEcho && !dispatch.job_contractorActionTokenHash && !dispatch.job_customerActionTokenHash
          ? { contractorToken, customerToken }
          : undefined;

      return {
        kind: "ok_accepted" as const,
        tokens: tokensToReturn,
        jobId: dispatch.jobId,
        jobPosterUserId: dispatch.job_jobPosterUserId ?? null,
        contractorId: dispatch.contractorId,
      };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "already_responded") return NextResponse.json({ error: "Already responded" }, { status: 409 });
    if (result.kind === "expired") return NextResponse.json({ error: "Expired" }, { status: 409 });
    if (result.kind === "job_not_owned") return NextResponse.json({ error: "Job not owned by router" }, { status: 409 });
    if (result.kind === "job_not_available") return NextResponse.json({ error: "Job not available" }, { status: 409 });
    if (result.kind === "authorization_expired") {
      return NextResponse.json({ error: "Authorization expired. Job closed without charge." }, { status: 409 });
    }
    if (result.kind === "payment_not_authorized") {
      return NextResponse.json({ error: "Payment hold is not capturable." }, { status: 409 });
    }
    if (result.kind === "ok_declined") return NextResponse.json({ ok: true, status: "DECLINED" });

    // Messaging activation: ensure a conversation exists for this job + participants.
    // Best-effort (do not block job acceptance if messaging setup fails).
    try {
      const jobPosterUserId = (result as any)?.jobPosterUserId ?? null;
      const contractorId = (result as any)?.contractorId ?? null;
      if (jobPosterUserId && contractorId) {
        const contractorRows = await db.select({ email: contractors.email }).from(contractors).where(eq(contractors.id, contractorId)).limit(1);
        const email = String(contractorRows[0]?.email ?? "").trim().toLowerCase();
        if (email) {
          const userRows = await db
            .select({ id: users.id })
            .from(users)
            .where(sql<boolean>`lower(${users.email}) = ${email}`)
            .limit(1);
          const contractorUserId = userRows[0]?.id ?? null;
          if (contractorUserId) {
            await db
              .insert(conversations)
              .values({
                id: crypto.randomUUID(),
                jobId: (result as any).jobId,
                contractorUserId,
                jobPosterUserId,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .onConflictDoNothing({
                target: [conversations.jobId, conversations.contractorUserId, conversations.jobPosterUserId],
              });
          }
        }
      }
    } catch {
      // ignore (best-effort only)
    }

    return NextResponse.json({ ok: true, status: "ACCEPTED", tokens: (result as any).tokens });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

