import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { contractors } from "../../../../../db/schema/contractor";
import { conversations } from "../../../../../db/schema/conversation";
import { jobAssignments } from "../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../db/schema/job";
import { messages } from "../../../../../db/schema/message";
import { users } from "../../../../../db/schema/user";
import { requireContractorReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";
import { z } from "zod";

const ProposeSchema = z.object({
  jobId: z.string().trim().min(10),
  day: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeOfDay: z.enum(["Morning", "Afternoon", "Evening"])
});

function isWeekend(d: Date): boolean {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  return day === 0 || day === 6;
}

function nextBusinessDays(count: number, from = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (out.length < count) {
    if (!isWeekend(d)) {
      out.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
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
    .select({
      id: contractors.id,
      businessName: contractors.businessName,
      trade: contractors.trade,
      regionCode: contractors.regionCode,
      email: contractors.email,
      phone: contractors.phone,
    })
    .from(contractors)
    .where(eq(contractors.email, user.email))
    .limit(1);
  const contractor = contractorRows[0] ?? null;
  if (!contractor) return { kind: "no_contractor" as const };
  return { kind: "ok" as const, user, contractor };
}

export async function GET(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const c = await getContractorForUser(u.userId);
    if (c.kind !== "ok") return NextResponse.json({ ok: true, hasContractor: false, active: null });

    const assignmentRows = await db
      .select({
        jobId: jobAssignments.jobId,
        job_id: jobs.id,
        job_title: jobs.title,
        job_region: jobs.region,
        job_status: jobs.status,
        job_paymentStatus: jobs.paymentStatus,
        job_payoutStatus: jobs.payoutStatus,
        job_contractorCompletedAt: jobs.contractorCompletedAt,
        job_customerApprovedAt: jobs.customerApprovedAt,
        job_routerApprovedAt: jobs.routerApprovedAt,
        job_jobPosterUserId: jobs.jobPosterUserId,
        job_availability: jobs.availability,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .where(
        and(
          eq(jobAssignments.contractorId, c.contractor.id),
          inArray(jobs.status, ["ASSIGNED", "IN_PROGRESS", "CONTRACTOR_COMPLETED", "CUSTOMER_APPROVED", "COMPLETED_APPROVED", "COMPLETED"]),
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
      paymentStatus: (assignment as any).job_paymentStatus,
      payoutStatus: (assignment as any).job_payoutStatus,
      contractorCompletedAt: (assignment as any).job_contractorCompletedAt ?? null,
      customerApprovedAt: (assignment as any).job_customerApprovedAt ?? null,
      routerApprovedAt: (assignment as any).job_routerApprovedAt ?? null,
      jobPosterUserId: assignment.job_jobPosterUserId,
      availability: (assignment as any).job_availability ?? null,
    };

    const proposedRows = await db
      .select({ metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "APPOINTMENT_PROPOSED"),
          eq(auditLogs.entityType, "Job"),
          eq(auditLogs.entityId, job.id),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const proposed = proposedRows[0] ?? null;
    const proposedMeta = (proposed?.metadata ?? null) as any;
    const appointmentForThisContractor =
      proposedMeta?.contractorId && String(proposedMeta.contractorId) === c.contractor.id;

    const sharedRows = await db
      .select({ metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "JOB_POSTER_CONTACT_SHARED"),
          eq(auditLogs.entityType, "Job"),
          eq(auditLogs.entityId, job.id),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const shared = sharedRows[0] ?? null;
    const sharedMeta = (shared?.metadata ?? null) as any;
    const sharedForThisContractor =
      sharedMeta?.contractorId && String(sharedMeta.contractorId) === c.contractor.id;

    const state =
      job.status === "IN_PROGRESS" || sharedForThisContractor
        ? "IN_PROGRESS"
        : appointmentForThisContractor
          ? "AWAITING_CONTACT_SHARE"
          : "NEEDS_APPOINTMENT";

    return NextResponse.json({
      ok: true,
      hasContractor: true,
      active: {
        job: {
          id: job.id,
          title: job.title,
          region: job.region,
          status: job.status,
          paymentStatus: (job as any).paymentStatus ?? null,
          payoutStatus: (job as any).payoutStatus ?? null,
          contractorCompletedAt: (job as any).contractorCompletedAt ?? null,
          customerApprovedAt: (job as any).customerApprovedAt ?? null,
          routerApprovedAt: (job as any).routerApprovedAt ?? null,
          availability: (job as any).availability ?? null,
        },
        state,
        allowedDays: nextBusinessDays(3),
        appointment: appointmentForThisContractor
          ? {
              day: typeof proposedMeta?.day === "string" ? proposedMeta.day : null,
              timeOfDay: typeof proposedMeta?.timeOfDay === "string" ? proposedMeta.timeOfDay : null,
              proposedAt: proposed ? proposed.createdAt.toISOString() : null
            }
          : null,
        contact: sharedForThisContractor
          ? {
              email: typeof sharedMeta?.email === "string" ? sharedMeta.email : null,
              phone: typeof sharedMeta?.phone === "string" ? sharedMeta.phone : null,
              sharedAt: shared ? shared.createdAt.toISOString() : null
            }
          : null
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const ready = await requireContractorReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const c = await getContractorForUser(u.userId);
    if (c.kind !== "ok") return NextResponse.json({ error: "No contractor profile found" }, { status: 404 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = ProposeSchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const allowed = nextBusinessDays(3);
    if (!allowed.includes(body.data.day)) {
      return NextResponse.json(
        { error: "Day must be within the next 3 business days." },
        { status: 400 }
      );
    }

    const assignmentRows = await db
      .select({
        contractorId: jobAssignments.contractorId,
        job_id: jobs.id,
        job_status: jobs.status,
        job_jobPosterUserId: jobs.jobPosterUserId,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
      .where(eq(jobAssignments.jobId, body.data.jobId))
      .limit(1);
    const assignment = assignmentRows[0] ?? null;
    if (!assignment?.job_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (assignment.contractorId !== c.contractor.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (assignment.job_status !== "ASSIGNED") {
      return NextResponse.json({ error: "Appointment proposals require an ASSIGNED job." }, { status: 409 });
    }

    const jobPosterUserId = assignment.job_jobPosterUserId ?? null;
    if (!jobPosterUserId) return NextResponse.json({ error: "Job poster missing" }, { status: 409 });

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: u.userId,
        action: "APPOINTMENT_PROPOSED",
        entityType: "Job",
        entityId: assignment.job_id,
        metadata: {
          contractorId: c.contractor.id,
          day: body.data.day,
          timeOfDay: body.data.timeOfDay,
        } as any,
      });

      // Ensure conversation exists (job-bound, contractor ↔ job poster).
      const convoId = crypto.randomUUID();
      const inserted = await tx
        .insert(conversations)
        .values({
          id: convoId,
          jobId: assignment.job_id,
          contractorUserId: u.userId,
          jobPosterUserId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [conversations.jobId, conversations.contractorUserId, conversations.jobPosterUserId],
        })
        .returning({ id: conversations.id });

      const conversationId =
        inserted[0]?.id ??
        (
          await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                eq(conversations.jobId, assignment.job_id),
                eq(conversations.contractorUserId, u.userId),
                eq(conversations.jobPosterUserId, jobPosterUserId),
              ),
            )
            .limit(1)
        )[0]?.id ??
        null;

      if (!conversationId) throw Object.assign(new Error("Conversation missing"), { status: 500 });

      // First system message (spec): only insert if conversation has no messages yet.
      const existingMsg = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .limit(1);
      if (existingMsg.length === 0) {
        await tx.insert(messages).values({
          id: crypto.randomUUID(),
          conversationId,
          senderUserId: "system",
          senderRole: "SYSTEM",
          body: `Contractor accepted the job and proposed ${body.data.day} at ${body.data.timeOfDay}.`,
          createdAt: now,
        });
      }

      await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

