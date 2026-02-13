import { NextResponse } from "next/server";
import { requireRouter } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { assertJobTransition } from "../../../../../src/jobs/jobTransitions";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs, jobHolds, jobs } from "../../../../../db/schema";
import { randomUUID } from "crypto";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/router-hold
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  reason: z.enum(["DISPUTE", "QUALITY_ISSUE", "FRAUD_REVIEW", "MANUAL_REVIEW"]),
  notes: z.string().max(2000).optional()
});

export async function POST(req: Request) {
  try {
    const user = await requireRouter(req);
    const id = getIdFromUrl(req);
    const body = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const job =
        (
          await tx
            .select({ id: jobs.id, status: jobs.status, routerId: jobs.claimedByUserId })
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.routerId !== user.userId) return { kind: "forbidden" as const };

      // Locked: router can flag/place hold instead of approving.
      assertJobTransition(job.status, "COMPLETION_FLAGGED");

      await tx
        .update(jobs)
        .set({
          status: "COMPLETION_FLAGGED" as any,
          completionFlaggedAt: new Date(),
          completionFlagReason: body.data.reason,
        })
        .where(eq(jobs.id, id));

      const updated =
        (
          await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!updated) throw Object.assign(new Error("Job not found after update"), { status: 404 });

      await tx.insert(jobHolds).values({
        id: randomUUID(),
        jobId: id,
        reason: body.data.reason as any,
        notes: body.data.notes?.trim() || null,
        appliedByUserId: user.userId,
        status: "ACTIVE" as any,
        appliedAt: new Date(),
      });

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: user.userId,
        action: "JOB_ROUTER_HOLD",
        entityType: "Job",
        entityId: id,
        metadata: {
          toStatus: updated.status,
          reason: body.data.reason,
          notes: body.data.notes?.trim() || undefined,
        } as any,
      });

      return { kind: "ok" as const, job: updated };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ job: result.job });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

