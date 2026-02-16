import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { db } from "../../../../../../db/drizzle";
import { jobs } from "../../../../../../db/schema/job";
import { jobPhotos } from "../../../../../../db/schema/jobPhoto";
import { jobPayments } from "../../../../../../db/schema/jobPayment";
import { jobAssignments } from "../../../../../../db/schema/jobAssignment";
import { auditLogs } from "../../../../../../db/schema/auditLog";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("drafts");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const jobRows = await db
      .select({ id: jobs.id, status: jobs.status, jobPosterUserId: jobs.jobPosterUserId })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job || job.jobPosterUserId !== user.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photoRows = await db
      .select({ url: jobPhotos.url, metadata: jobPhotos.metadata })
      .from(jobPhotos)
      .where(eq(jobPhotos.jobId, id))
      .orderBy(asc(jobPhotos.createdAt));

    const draftPhotos =
      (photoRows ?? [])
        .filter((p) => (p as any)?.metadata?.label === "JOB_POSTING_DRAFT")
        .map((p) => String((p as any)?.url ?? "").trim())
        .filter(Boolean);

    return NextResponse.json({
      ok: true,
      draft: {
        id: job.id,
        jobId: job.id,
        status: job.status,
        data: null,
        photoUrls: draftPhotos,
      },
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const currentRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        jobPosterUserId: jobs.jobPosterUserId,
        paymentCapturedAt: jobs.paymentCapturedAt,
        escrowLockedAt: jobs.escrowLockedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);
    const current = currentRows[0] ?? null;
    if (!current || current.jobPosterUserId !== user.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (String(current.status) !== "DRAFT") {
      return NextResponse.json({ error: "Only drafts can be deleted" }, { status: 409 });
    }
    if (current.paymentCapturedAt || current.escrowLockedAt) {
      return NextResponse.json({ error: "Cannot delete after payment is started" }, { status: 409 });
    }

    // Optional cleanup (table may not exist in some dev DBs). Best-effort.
    await db
      .execute(sql`delete from "JobPosterResumeToken" where "jobId" = ${id}`)
      .catch(() => null);

    await db.transaction(async (tx) => {
      await tx.delete(jobPhotos).where(eq(jobPhotos.jobId, id));
      await tx.delete(jobPayments).where(eq(jobPayments.jobId, id));
      await tx.delete(jobAssignments).where(eq(jobAssignments.jobId, id));

      // Best-effort cleanup for repeat contractor request (may not exist everywhere).
      await tx.execute(sql`delete from "RepeatContractorRequest" where "jobId" = ${id}`).catch(() => null);

      await tx.delete(jobs).where(eq(jobs.id, id));

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        action: "JOB_POSTING_DRAFT_DELETED",
        entityType: "Job",
        entityId: id,
        metadata: {},
      }).catch(() => null);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

