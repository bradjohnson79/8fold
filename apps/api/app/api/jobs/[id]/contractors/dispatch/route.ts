import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireRouterReady } from "../../../../../../src/auth/requireRouterReady";
import { HOURS_24_MS } from "../../../../../../src/services/monitoringService";
import { toHttpError } from "../../../../../../src/http/errors";
import { stateFromRegion } from "../../../../../../src/jobs/geo";
import { z } from "zod";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs, contractors, jobDispatches, jobs, routerProfiles } from "../../../../../../db/schema";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/contractors/dispatch
  return parts[parts.length - 3] ?? "";
}

const BodySchema = z.object({
  contractorId: z.string().min(1)
});

export async function POST(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;
    const jobId = getJobIdFromUrl(req);
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
              region: jobs.region,
              serviceType: jobs.serviceType,
              routerId: jobs.claimedByUserId,
              contractorPayoutCents: jobs.contractorPayoutCents,
            })
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1)
        )[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.status !== "PUBLISHED") return { kind: "job_not_available" as const };
      if (job.routerId !== router.userId) return { kind: "forbidden" as const };
      if (!job.contractorPayoutCents || job.contractorPayoutCents <= 0) return { kind: "pricing_unlocked" as const };

      const profile =
        (
          await tx
            .select({ stateProvince: (routerProfiles as any).stateProvince })
            .from(routerProfiles)
            .where(eq(routerProfiles.userId, router.userId))
            .limit(1)
        )[0] ?? null;
      const jobState = stateFromRegion(job.region);
      const routerState = String((profile as any)?.stateProvince ?? "").trim().toUpperCase();
      if (!routerState || routerState !== jobState) return { kind: "router_state_mismatch" as const };

      // v1 routing: allow up to 5 contractors per job (busy contractors allowed but deprioritized elsewhere).
      const now = new Date();
      const existingPending = await tx
        .select({ id: jobDispatches.id, contractorId: jobDispatches.contractorId })
        .from(jobDispatches)
        .where(and(eq(jobDispatches.jobId, job.id), eq(jobDispatches.status, "PENDING"), gt(jobDispatches.expiresAt, now)));
      if (existingPending.some((d) => d.contractorId === body.data.contractorId)) {
        return { kind: "already_sent" as const };
      }
      if (existingPending.length >= 5) return { kind: "too_many" as const };

      const contractor =
        (
          await tx
            .select({ id: contractors.id, status: contractors.status })
            .from(contractors)
            .where(eq(contractors.id, body.data.contractorId))
            .limit(1)
        )[0] ?? null;
      if (!contractor || contractor.status !== "APPROVED") return { kind: "contractor_not_eligible" as const };

      // Concurrency guard: if the job was unclaimed/rerouted after our initial read, do not dispatch.
      const claim =
        (
          await tx
            .select({ routerId: jobs.claimedByUserId, status: jobs.status })
            .from(jobs)
            .where(eq(jobs.id, job.id))
            .limit(1)
        )[0] ?? null;
      if (!claim || claim.status !== "PUBLISHED" || claim.routerId !== router.userId) {
        return { kind: "job_not_available" as const };
      }

      const rawToken = crypto.randomBytes(24).toString("hex");
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(now.getTime() + HOURS_24_MS);

      const dispatchId = crypto.randomUUID();
      const dispatch =
        (
          await tx
            .insert(jobDispatches)
            .values({
              id: dispatchId,
              jobId: job.id,
              contractorId: contractor.id,
              routerUserId: router.userId,
              tokenHash,
              expiresAt,
              status: "PENDING",
            })
            .returning({ id: jobDispatches.id, expiresAt: jobDispatches.expiresAt })
        )[0] ?? null;
      if (!dispatch) throw new Error("Failed to create dispatch");

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: router.userId,
        action: "JOB_DISPATCH_SENT",
        entityType: "Job",
        entityId: job.id,
        metadata: { dispatchId: dispatch.id, contractorId: contractor.id, expiresAt: dispatch.expiresAt.toISOString() } as any,
      });

      const allowEcho = process.env.ALLOW_DEV_OTP_ECHO === "true";
      const tokenToReturn = process.env.NODE_ENV !== "production" && allowEcho ? rawToken : undefined;
      return { kind: "ok" as const, dispatchId: dispatch.id, token: tokenToReturn };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "job_not_available") return NextResponse.json({ error: "Job not available" }, { status: 409 });
    if (result.kind === "pricing_unlocked") return NextResponse.json({ error: "Job pricing is not locked" }, { status: 409 });
    if (result.kind === "router_state_mismatch")
      return NextResponse.json({ error: "Router must be in the same state/province as the job" }, { status: 409 });
    if (result.kind === "already_sent") return NextResponse.json({ error: "Already sent to that contractor" }, { status: 409 });
    if (result.kind === "too_many") return NextResponse.json({ error: "Max 5 contractors per job" }, { status: 409 });
    if (result.kind === "contractor_not_eligible")
      return NextResponse.json({ error: "Contractor not eligible" }, { status: 409 });

    return NextResponse.json({ ok: true, dispatchId: result.dispatchId, token: result.token });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

