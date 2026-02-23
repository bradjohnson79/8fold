import { NextResponse } from "next/server";
import { toHttpError } from "../../../../../src/http/errors";
import { verifyActionToken } from "../../../../../src/jobs/actionTokens";
import { assertJobTransition } from "../../../../../src/jobs/jobTransitions";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs, jobHolds, jobs, users } from "../../../../../db/schema";
import { randomUUID } from "crypto";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/customer-review
  return parts[parts.length - 2] ?? "";
}

const RejectReasonSchema = z.enum(["QUALITY_ISSUE", "INCOMPLETE_WORK", "DAMAGE", "NO_SHOW", "OTHER"]);

const BodySchema = z.object({
  token: z.string().min(10),
  decision: z.enum(["ACCEPT", "REJECT"]),
  feedback: z.string().max(2000).optional(),
  rejectReason: RejectReasonSchema.optional(),
  rejectNotes: z.string().max(2000).optional()
});

export async function POST(req: Request) {
  try {
    const id = getIdFromUrl(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const job =
        (
          await tx
            .select({
              id: jobs.id,
              status: jobs.status,
              customerActionTokenHash: jobs.customer_action_token_hash,
              routerId: jobs.claimed_by_user_id,
            })
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (!verifyActionToken(body.data.token, job.customerActionTokenHash)) {
        return { kind: "forbidden" as const };
      }

      if (body.data.decision === "ACCEPT") {
        assertJobTransition(job.status, "CUSTOMER_APPROVED");
        await tx
          .update(jobs)
          .set({
            status: "CUSTOMER_APPROVED" as any,
            customer_approved_at: new Date(),
            customer_feedback: body.data.feedback?.trim() || null,
          })
          .where(eq(jobs.id, id));

        const updated =
          (
            await tx
              .select({
                id: jobs.id,
                status: jobs.status,
                payoutStatus: jobs.payout_status,
                paymentStatus: jobs.payment_status,
                createdAt: jobs.created_at,
                updatedAt: jobs.updated_at,
                publishedAt: jobs.published_at,
              })
              .from(jobs)
              .where(eq(jobs.id, id))
              .limit(1)
          )[0] ?? null;
        if (!updated) throw Object.assign(new Error("Job not found after update"), { status: 404 });

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: null,
          action: "JOB_CUSTOMER_APPROVED",
          entityType: "Job",
          entityId: id,
          metadata: { toStatus: updated.status } as any,
        });
        return { kind: "ok" as const, job: updated };
      }

      // REJECT: reason required (dropdown + optional notes)
      if (!body.data.rejectReason) {
        return { kind: "reject_reason_required" as const };
      }
      assertJobTransition(job.status, "CUSTOMER_REJECTED");
      await tx
        .update(jobs)
        .set({
          status: "CUSTOMER_REJECTED" as any,
          customer_rejected_at: new Date(),
          customer_reject_reason: body.data.rejectReason as any,
          customer_reject_notes: body.data.rejectNotes?.trim() || null,
        })
        .where(eq(jobs.id, id));

      const updated =
        (
          await tx
            .select({
              id: jobs.id,
              status: jobs.status,
              payoutStatus: jobs.payout_status,
              paymentStatus: jobs.payment_status,
              createdAt: jobs.created_at,
              updatedAt: jobs.updated_at,
              publishedAt: jobs.published_at,
            })
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!updated) throw Object.assign(new Error("Job not found after update"), { status: 404 });

      // Place an active DISPUTE hold to fully block payout scheduling until resolved.
      await tx.insert(jobHolds).values({
        id: randomUUID(),
        jobId: id,
        reason: "DISPUTE" as any,
        notes: `Customer rejected (${body.data.rejectReason})`,
        status: "ACTIVE" as any,
        appliedAt: new Date(),
      });

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: null,
        action: "JOB_CUSTOMER_REJECTED",
        entityType: "Job",
        entityId: id,
        metadata: {
          toStatus: updated.status,
          rejectReason: body.data.rejectReason,
          rejectNotes: body.data.rejectNotes?.trim() || undefined,
        } as any,
      });

      return { kind: "ok" as const, job: updated };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "reject_reason_required") {
      return NextResponse.json({ error: "Reject reason required" }, { status: 400 });
    }
    // Notify router when job reaches "AWAITING_ROUTER_APPROVAL" (canonical: CUSTOMER_APPROVED).
    // v1: we log a notification event deterministically (email/SMS sending is stubbed for dev/demo).
    if (result.kind === "ok" && result.job.status === "CUSTOMER_APPROVED") {
      const job =
        (
          await db
            .select({ routerId: jobs.claimed_by_user_id })
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (job?.routerId) {
        const u =
          (
            await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, job.routerId))
              .limit(1)
          )[0] ?? null;
        const deadlineAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await db.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: null,
          action: "ROUTER_APPROVAL_NOTIFICATION_EVENT",
          entityType: "Job",
          entityId: id,
          metadata: {
            routerUserId: job.routerId,
            methods: {
              email: Boolean(u?.email),
              sms: false,
            },
            deadlineAt,
          } as any,
        });
      }
    }

    return NextResponse.json({ job: result.job });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }
}

