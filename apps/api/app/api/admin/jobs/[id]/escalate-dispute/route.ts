import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { db } from "../../../../../../db/drizzle";
import { disputeCases } from "../../../../../../db/schema/disputeCase";
import { jobs } from "../../../../../../db/schema/job";
import { supportTickets } from "../../../../../../db/schema/supportTicket";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/escalate-dispute
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  againstRole: z.enum(["JOB_POSTER", "CONTRACTOR"]),
  disputeReason: z.enum(["PRICING", "WORK_QUALITY", "NO_SHOW", "PAYMENT", "OTHER"]),
  description: z.string().trim().min(5).max(4000),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const jobId = getJobIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "missing_job_id" }, { status: 400 });

    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

    const jobRows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        jobPosterUserId: jobs.job_poster_user_id,
        contractorUserId: jobs.contractor_user_id,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const filedByUserId = auth.userId;
    const againstUserId =
      body.data.againstRole === "JOB_POSTER" ? String(job.jobPosterUserId ?? "") : String(job.contractorUserId ?? "");
    if (!againstUserId) {
      return NextResponse.json({ ok: false, error: "missing_against_user" }, { status: 409 });
    }

    // Idempotency: one open dispute per job+againstRole.
    const existing = await db
      .select({ id: disputeCases.id, status: disputeCases.status })
      .from(disputeCases)
      .where(and(eq(disputeCases.jobId, jobId), eq(disputeCases.againstRole, body.data.againstRole as any)))
      .limit(1);
    if (existing[0]) {
      return NextResponse.json({ ok: true, data: { alreadyExists: true, disputeCaseId: existing[0].id } }, { status: 200 });
    }

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h SLA default for ops escalation

    const ticketId = crypto.randomUUID();
    const disputeCaseId = crypto.randomUUID();

    await db.transaction(async (tx: any) => {
      await tx.insert(supportTickets).values({
        id: ticketId,
        createdAt: now,
        updatedAt: now,
        type: "DISPUTE",
        status: "OPEN",
        category: "OTHER",
        priority: body.data.priority ?? "HIGH",
        createdById: filedByUserId,
        assignedToId: null,
        roleContext: body.data.againstRole === "JOB_POSTER" ? "JOB_POSTER" : "CONTRACTOR",
        subject: `Dispute escalation: ${job.title ?? "Job"} (${jobId})`,
      } as any);

      await tx.insert(disputeCases).values({
        id: disputeCaseId,
        createdAt: now,
        updatedAt: now,
        ticketId,
        jobId,
        filedByUserId,
        againstUserId,
        againstRole: body.data.againstRole as any,
        disputeReason: body.data.disputeReason as any,
        description: body.data.description,
        status: "SUBMITTED",
        deadlineAt,
      } as any);
    });

    return NextResponse.json({ ok: true, data: { ticketId, disputeCaseId, deadlineAt: deadlineAt.toISOString() } }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/[id]/escalate-dispute", { userId: auth.userId });
  }
}

