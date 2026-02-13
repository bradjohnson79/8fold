import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractors } from "../../../../../db/schema/contractor";
import { jobAssignments } from "../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../db/schema/job";
import { users } from "../../../../../db/schema/user";
import { requireUser } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { z } from "zod";

const SetSchema = z.object({
  jobId: z.string().trim().min(10),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const UpdateSchema = z.object({
  jobId: z.string().trim().min(10),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.enum(["AWAITING_PARTS_MATERIALS", "SCOPE_EXPANDED", "SCHEDULING_DELAY", "OTHER"]),
  otherText: z.string().trim().max(200).optional()
});

function toUtcDateOnly(dateStr: string): Date {
  // Treat as date-only (UTC midnight) for consistent comparisons across timezones.
  return new Date(`${dateStr}T00:00:00.000Z`);
}

async function getContractorForUser(userId: string) {
  const userRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = userRows[0] ?? null;
  if (!user?.email) return { kind: "no_email" as const };
  const contractorRows = await db
    .select({ id: contractors.id, email: contractors.email })
    .from(contractors)
    .where(eq(contractors.email, user.email))
    .limit(1);
  const contractor = contractorRows[0] ?? null;
  if (!contractor) return { kind: "no_contractor" as const };
  return { kind: "ok" as const, user, contractor };
}

export async function GET(req: Request) {
  try {
    const u = await requireUser(req);
    const c = await getContractorForUser(u.userId);
    if (c.kind !== "ok") return NextResponse.json({ ok: true, hasContractor: false, active: null });

    const assignmentRows = await db
      .select({
        job_id: jobs.id,
        job_title: jobs.title,
        job_region: jobs.region,
        job_status: jobs.status,
        job_estimatedCompletionDate: jobs.estimatedCompletionDate,
        job_estimateSetAt: jobs.estimateSetAt,
        job_estimateUpdatedAt: jobs.estimateUpdatedAt,
        job_estimateUpdateReason: jobs.estimateUpdateReason,
        job_estimateUpdateOtherText: jobs.estimateUpdateOtherText,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .where(
        and(
          eq(jobAssignments.contractorId, c.contractor.id),
          inArray(jobs.status, ["ASSIGNED", "IN_PROGRESS"]),
        ),
      )
      .orderBy(desc(jobAssignments.createdAt))
      .limit(1);
    const assignment = assignmentRows[0] ?? null;

    if (!assignment?.job_id) return NextResponse.json({ ok: true, hasContractor: true, active: null });

    const job = {
      id: assignment.job_id,
      title: assignment.job_title,
      region: assignment.job_region,
      status: assignment.job_status,
      estimatedCompletionDate: assignment.job_estimatedCompletionDate,
      estimateSetAt: assignment.job_estimateSetAt,
      estimateUpdatedAt: assignment.job_estimateUpdatedAt,
      estimateUpdateReason: assignment.job_estimateUpdateReason,
      estimateUpdateOtherText: assignment.job_estimateUpdateOtherText,
    };

    const ecd = job.estimatedCompletionDate ? job.estimatedCompletionDate.toISOString().slice(0, 10) : null;
    const nowDateOnly = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    const completionDateReached = Boolean(job.estimatedCompletionDate && job.estimatedCompletionDate < nowDateOnly);

    return NextResponse.json({
      ok: true,
      hasContractor: true,
      active: {
        job: { id: job.id, title: job.title, region: job.region, status: job.status },
        estimate: {
          estimatedCompletionDate: ecd,
          setAt: job.estimateSetAt ? job.estimateSetAt.toISOString() : null,
          updatedAt: job.estimateUpdatedAt ? job.estimateUpdatedAt.toISOString() : null,
          updateReason: job.estimateUpdateReason ?? null,
          updateOtherText: job.estimateUpdateOtherText ?? null
        },
        rules: {
          canSet: job.estimateSetAt == null,
          canUpdateOnce: job.estimateSetAt != null && job.estimateUpdatedAt == null
        },
        badges: { completionDateReached }
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const c = await getContractorForUser(u.userId);
    if (c.kind !== "ok") return NextResponse.json({ error: "No contractor profile found" }, { status: 404 });

    const raw = await req.json().catch(() => ({}));
    const mode = String((raw as any)?.mode ?? "set");

    if (mode === "update") {
      const body = UpdateSchema.safeParse(raw);
      if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      if (body.data.reason === "OTHER" && !body.data.otherText) {
        return NextResponse.json({ error: "Other reason text is required." }, { status: 400 });
      }

      const result = await db.transaction(async (tx) => {
        const assignmentRows = await tx
          .select({
            contractorId: jobAssignments.contractorId,
            job_id: jobs.id,
            job_status: jobs.status,
            job_estimateSetAt: jobs.estimateSetAt,
            job_estimateUpdatedAt: jobs.estimateUpdatedAt,
          })
          .from(jobAssignments)
          .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
          .where(eq(jobAssignments.jobId, body.data.jobId))
          .limit(1);
        const assignment = assignmentRows[0] ?? null;

        if (!assignment?.job_id) return { kind: "not_found" as const };
        if (assignment.contractorId !== c.contractor.id) return { kind: "forbidden" as const };
        if (!assignment.job_estimateSetAt) return { kind: "not_set" as const };
        if (assignment.job_estimateUpdatedAt) return { kind: "already_updated" as const };

        const nextDate = toUtcDateOnly(body.data.date);
        const now = new Date();

        await tx
          .update(jobs)
          .set({
            estimatedCompletionDate: nextDate,
            estimateUpdatedAt: now,
            estimateUpdateReason: body.data.reason as any,
            estimateUpdateOtherText: body.data.reason === "OTHER" ? (body.data.otherText ?? null) : null,
          })
          .where(eq(jobs.id, assignment.job_id));

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: u.userId,
          action: "ECD_UPDATED",
          entityType: "Job",
          entityId: assignment.job_id,
          metadata: {
            date: body.data.date,
            reason: body.data.reason,
            otherText: body.data.reason === "OTHER" ? body.data.otherText ?? null : null,
          } as any,
        });

        return { kind: "ok" as const };
      });

      if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (result.kind === "not_set") return NextResponse.json({ error: "Estimate must be set before it can be updated." }, { status: 409 });
      if (result.kind === "already_updated") return NextResponse.json({ error: "Estimate can only be updated once." }, { status: 409 });
      return NextResponse.json({ ok: true });
    }

    const body = SetSchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const assignmentRows = await tx
        .select({
          contractorId: jobAssignments.contractorId,
          job_id: jobs.id,
          job_estimateSetAt: jobs.estimateSetAt,
        })
        .from(jobAssignments)
        .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
        .where(eq(jobAssignments.jobId, body.data.jobId))
        .limit(1);
      const assignment = assignmentRows[0] ?? null;

      if (!assignment?.job_id) return { kind: "not_found" as const };
      if (assignment.contractorId !== c.contractor.id) return { kind: "forbidden" as const };
      if (assignment.job_estimateSetAt) return { kind: "already_set" as const };

      const ecd = toUtcDateOnly(body.data.date);
      const now = new Date();

      await tx
        .update(jobs)
        .set({
          estimatedCompletionDate: ecd,
          estimateSetAt: now,
          estimateUpdatedAt: null,
          estimateUpdateReason: null,
          estimateUpdateOtherText: null,
        })
        .where(eq(jobs.id, assignment.job_id));

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "ECD_SET",
        entityType: "Job",
        entityId: assignment.job_id,
        metadata: { date: body.data.date } as any,
      });

      return { kind: "ok" as const };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "already_set") return NextResponse.json({ error: "Estimate already set." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

