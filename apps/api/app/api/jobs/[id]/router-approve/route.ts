import { NextResponse } from "next/server";
import { requireRouterReady } from "../../../../../src/auth/requireRouterReady";
import { toHttpError } from "../../../../../src/http/errors";
import { assertJobTransition } from "../../../../../src/jobs/jobTransitions";
import { getOrCreatePlatformUserId } from "../../../../../src/system/platformUser";
import { releaseJobFunds } from "../../../../../src/payouts/releaseJobFunds";
import { maybeCreateRouterReferralRewardForUser, trySettleRouterReward } from "../../../../../src/rewards/routerRewards";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs, contractors, jobAssignments, jobs, materialsRequests, routers, users } from "../../../../../db/schema";
import { randomUUID } from "crypto";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/router-approve
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  notes: z.string().max(2000).optional()
});

export async function POST(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const user = authed;
    const id = getIdFromUrl(req);
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const job =
        (
          await tx
            .select({
              id: jobs.id,
              status: jobs.status,
              isMock: jobs.isMock,
              routerId: jobs.claimedByUserId,
              routerEarningsCents: jobs.routerEarningsCents,
              brokerFeeCents: jobs.brokerFeeCents,
              jobPosterUserId: jobs.jobPosterUserId,
              contractorUserId: jobs.contractorUserId,
              payoutStatus: jobs.payoutStatus,
              paymentStatus: jobs.paymentStatus,
            })
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.isMock) return { kind: "mock_job" as const };
      if (String(job.status ?? "") === "DISPUTED") return { kind: "disputed" as const };
      if (job.routerId !== user.userId) return { kind: "forbidden" as const };

      const pendingMaterials =
        (
          await tx
            .select({ c: sql<number>`count(${materialsRequests.id})` })
            .from(materialsRequests)
            .where(and(eq(materialsRequests.jobId, id), eq(materialsRequests.status, "SUBMITTED" as any)))
        )[0]?.c ?? 0;
      if (pendingMaterials > 0) return { kind: "materials_pending" as const };

      // Locked: router is final gate; only CUSTOMER_APPROVED can reach COMPLETED_APPROVED.
      assertJobTransition(job.status, "COMPLETED_APPROVED");

      const assignment =
        (
          await tx
            .select({ id: jobAssignments.id, contractorId: jobAssignments.contractorId, status: jobAssignments.status })
            .from(jobAssignments)
            .where(eq(jobAssignments.jobId, id))
            .limit(1)
        )[0] ?? null;
      if (!assignment) return { kind: "no_assignment" as const };

      const approvedAt = new Date();

      const jobUpdated = await tx
        .update(jobs)
        .set({
          status: "COMPLETED_APPROVED" as any,
          routerApprovedAt: approvedAt,
          routerApprovalNotes: body.data.notes?.trim() || null,
        })
        .where(and(eq(jobs.id, id), eq(jobs.claimedByUserId, user.userId)))
        .returning({ id: jobs.id });

      // Concurrency guard: if admin rerouted (or router unclaimed) mid-flight, do not proceed.
      // (The read-time check above is not sufficient under concurrent writes.)
      if (!jobUpdated.length) return { kind: "conflict" as const };

      await tx
        .update(jobAssignments)
        .set({ status: "COMPLETED", completedAt: approvedAt })
        .where(eq(jobAssignments.id, assignment.id));

      const updated =
        (
          await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!updated) throw Object.assign(new Error("Job not found after update"), { status: 404 });

      // Router referral rewards (automated; one per referred user; funded only from platform fee pool).
      // Resolve contractorUserId from assignment when job.contractorUserId is null (assignment flow may not populate it).
      let contractorUserIdResolved = String(job.contractorUserId ?? "").trim();
      if (!contractorUserIdResolved && assignment) {
        const cid = assignment.contractorId ?? null;
        if (cid) {
          const contractorRows = await tx
            .select({ email: contractors.email })
            .from(contractors)
            .where(eq(contractors.id, cid))
            .limit(1);
          const contractorEmail = contractorRows[0]?.email ?? null;
          if (contractorEmail) {
            const userRows = await tx
              .select({ id: users.id })
              .from(users)
              .where(sql`lower(${users.email}) = lower(${contractorEmail})`)
              .limit(1);
            contractorUserIdResolved = userRows[0]?.id ?? "";
          }
        }
      }

      const createdRewards: Array<{ id: string; routerUserId: string; amount: number; jobId: string }> = [];
      for (const referredUserId of [String(job.jobPosterUserId ?? "").trim(), contractorUserIdResolved]) {
        if (!referredUserId) continue;
        const created = await maybeCreateRouterReferralRewardForUser({ tx, jobId: id, referredUserId });
        if (created.created && created.rewardId && created.routerUserId) {
          createdRewards.push({ id: created.rewardId, routerUserId: created.routerUserId, amount: 500, jobId: id });
        }
      }

      // Attempt settlement immediately only if payout is released (refund-safe).
      if (String((updated as any)?.payoutStatus ?? "").toUpperCase() === "RELEASED") {
        const platformUserId = await getOrCreatePlatformUserId(tx as any);
        for (const r of createdRewards) {
          await trySettleRouterReward({
            tx,
            platformUserId,
            reward: { id: r.id, routerUserId: r.routerUserId, jobId: r.jobId, amount: r.amount, status: "PENDING" },
          });
        }
      }

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: user.userId,
        action: "JOB_ROUTER_APPROVED",
        entityType: "Job",
        entityId: id,
        metadata: {
          toStatus: updated.status,
          routerEarningsCents: job.routerEarningsCents,
          brokerFeeCents: job.brokerFeeCents,
        } as any,
      });

      // Senior router progress (system-driven only).
      await tx
        .update(routers)
        .set({ routesCompleted: sql`${routers.routesCompleted} + 1` })
        .where(and(eq(routers.userId, user.userId), eq(routers.status, "ACTIVE" as any)));

      return { kind: "ok" as const, job: updated };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "mock_job") return NextResponse.json({ error: "Mock jobs cannot be completed" }, { status: 409 });
    if (result.kind === "disputed") return NextResponse.json({ error: "Job is disputed" }, { status: 409 });
    if (result.kind === "no_assignment") return NextResponse.json({ error: "Job is not assigned" }, { status: 409 });
    if (result.kind === "materials_pending") {
      return NextResponse.json(
        { error: "Cannot complete job while a materials request is pending decision." },
        { status: 409 }
      );
    }
    if (result.kind === "conflict") return NextResponse.json({ error: "Job routing changed; retry." }, { status: 409 });
    // Release funds (Connect transfers / PayPal credit). Best-effort: completion approval is authoritative even if payout fails.
    try {
      await releaseJobFunds({ jobId: id, triggeredByUserId: user.userId });
    } catch {
      // Failure is reflected via TransferRecord + Job.payoutStatus; client can retry or admin can force retry.
    }

    return NextResponse.json({ job: result.job });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

