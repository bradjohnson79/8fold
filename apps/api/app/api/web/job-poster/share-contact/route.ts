import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { jobAssignments } from "../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../db/schema/job";
import { users } from "../../../../../db/schema/user";
import { requireJobPosterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";
import { z } from "zod";

const BodySchema = z.object({
  jobId: z.string().trim().min(10)
});

function getRequestIp(req: Request): string | null {
  const xfwd = req.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

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

    const jobRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        jobPosterUserId: jobs.jobPosterUserId,
        estimatedCompletionDate: jobs.estimatedCompletionDate,
        assignmentContractorId: jobAssignments.contractorId,
      })
      .from(jobs)
      .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .where(eq(jobs.id, body.data.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!job.assignmentContractorId) {
      return NextResponse.json({ error: "No contractor assigned" }, { status: 409 });
    }
    if (job.status !== "ASSIGNED") {
      return NextResponse.json({ error: "Contact share requires an ASSIGNED job." }, { status: 409 });
    }
    if (!job.estimatedCompletionDate) {
      return NextResponse.json(
        { error: "Contractor must set an Estimated Completion Date before contact info can be shared." },
        { status: 409 }
      );
    }

    const proposedRows = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "APPOINTMENT_PROPOSED"), eq(auditLogs.entityType, "Job"), eq(auditLogs.entityId, job.id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const proposedMeta = (proposedRows[0]?.metadata ?? null) as any;
    const okContractor =
      proposedMeta?.contractorId && String(proposedMeta.contractorId) === job.assignmentContractorId;
    if (!okContractor) {
      return NextResponse.json(
        { error: "Contractor must propose an appointment before contact info can be shared." },
        { status: 409 }
      );
    }

    const userRows = await db.select({ email: users.email }).from(users).where(eq(users.id, u.userId)).limit(1);
    const email = userRows[0]?.email ?? null;
    if (!email) return NextResponse.json({ error: "Missing user email" }, { status: 400 });

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: u.userId,
        action: "JOB_POSTER_CONTACT_SHARED",
        entityType: "Job",
        entityId: job.id,
        metadata: {
          contractorId: job.assignmentContractorId,
          sharedAt: now.toISOString(),
          ip: getRequestIp(req),
          email,
          phone: null,
        } as any,
      });

      await tx.update(jobs).set({ status: "IN_PROGRESS", publicStatus: "IN_PROGRESS" } as any).where(eq(jobs.id, job.id));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

