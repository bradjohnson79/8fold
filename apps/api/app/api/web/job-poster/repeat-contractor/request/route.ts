import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobAssignments } from "../../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../../db/schema/job";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";

const BodySchema = z.object({
  jobId: z.string().trim().min(10),
  contractorId: z.string().trim().min(10),
  priorJobId: z.string().trim().min(10)
});

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const { jobId, contractorId, priorJobId } = body.data;

    const result = await db.transaction(async (tx) => {
      const jobRows = await tx
        .select({ id: jobs.id, status: jobs.status, jobPosterUserId: jobs.jobPosterUserId, tradeCategory: jobs.tradeCategory })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.jobPosterUserId !== u.userId) return { kind: "forbidden" as const };
      if (job.status !== "DRAFT") return { kind: "bad_status" as const };

      const priorRows = await tx
        .select({
          id: jobs.id,
          jobPosterUserId: jobs.jobPosterUserId,
          tradeCategory: jobs.tradeCategory,
          status: jobs.status,
          assignment_contractorId: jobAssignments.contractorId,
        })
        .from(jobs)
        .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
        .where(eq(jobs.id, priorJobId))
        .limit(1);
      const prior = priorRows[0] ?? null;
      if (!prior || prior.jobPosterUserId !== u.userId) return { kind: "prior_not_found" as const };
      if (prior.status !== "COMPLETED_APPROVED") return { kind: "prior_not_completed" as const };
      if (prior.tradeCategory !== job.tradeCategory) return { kind: "trade_mismatch" as const };
      if (prior.assignment_contractorId !== contractorId) return { kind: "contractor_mismatch" as const };

      const existingRes = await tx.execute(sql`
        select id, status
        from "RepeatContractorRequest"
        where "jobId" = ${job.id}
        limit 1
      `);
      const existing = (existingRes.rows[0] ?? null) as any;
      if (existing) return { kind: "exists" as const, id: existing.id, status: existing.status };

      const now = new Date();
      const requestId = randomUUID();
      const createdRes = await tx.execute(sql`
        insert into "RepeatContractorRequest" (
          id,
          "createdAt",
          "updatedAt",
          "jobId",
          "contractorId",
          "tradeCategory",
          status,
          "requestedAt",
          "priorJobId"
        ) values (
          ${requestId},
          ${now},
          ${now},
          ${job.id},
          ${contractorId},
          ${job.tradeCategory},
          ${"REQUESTED"},
          ${now},
          ${priorJobId}
        )
        returning id, status, "requestedAt"
      `);
      const created = (createdRes.rows[0] ?? null) as any;

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "REPEAT_CONTRACTOR_REQUESTED",
        entityType: "Job",
        entityId: job.id,
        metadata: { contractorId, priorJobId, tradeCategory: job.tradeCategory } as any,
      });

      return {
        kind: "ok" as const,
        request: { id: created.id, status: created.status, requestedAt: created.requestedAt.toISOString() }
      };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "bad_status") return NextResponse.json({ error: "Job must be DRAFT" }, { status: 409 });
    if (result.kind === "prior_not_found") return NextResponse.json({ error: "Prior job not found" }, { status: 404 });
    if (result.kind === "prior_not_completed") return NextResponse.json({ error: "Prior job must be completed" }, { status: 409 });
    if (result.kind === "trade_mismatch") return NextResponse.json({ error: "Trade mismatch" }, { status: 409 });
    if (result.kind === "contractor_mismatch") return NextResponse.json({ error: "Contractor mismatch" }, { status: 409 });
    if (result.kind === "exists") return NextResponse.json({ ok: true, request: { id: result.id, status: result.status } });

    return NextResponse.json({ ok: true, request: result.request }, { status: 201 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

