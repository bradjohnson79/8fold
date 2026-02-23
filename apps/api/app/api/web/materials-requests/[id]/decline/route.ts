import { NextResponse } from "next/server";
import { optionalUser } from "../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../src/http/errors";
import { z } from "zod";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../db/schema/job";
import { materialsRequests } from "../../../../../../db/schema/materialsRequest";
import { isJobActive } from "../../../../../../src/utils/jobActive";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../materials-requests/:id/decline
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  decline: z.literal(true)
});

export async function POST(req: Request) {
  try {
    const u = await optionalUser(req);
    if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const requestId = getIdFromUrl(req);

    const mrRows = await db
      .select({
        id: materialsRequests.id,
        status: materialsRequests.status,
        jobPosterUserId: materialsRequests.jobPosterUserId,
        jobId: materialsRequests.jobId,
        jobStatus: jobs.status,
        jobPaymentStatus: jobs.payment_status,
      })
      .from(materialsRequests)
      .innerJoin(jobs, eq(jobs.id, materialsRequests.jobId))
      .where(eq(materialsRequests.id, requestId))
      .limit(1);
    const mr = mrRows[0] ?? null;
    if (!mr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (mr.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (mr.status !== "SUBMITTED") return NextResponse.json({ error: "Request is not pending" }, { status: 409 });

    if (!isJobActive({ paymentStatus: mr.jobPaymentStatus, status: mr.jobStatus })) {
      return NextResponse.json(
        { ok: false, error: "Job is not active. Parts & Materials unavailable." },
        { status: 400 },
      );
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(materialsRequests)
        .set({ status: "DECLINED" as any, declinedAt: now, declinedByUserId: u.userId, updatedAt: now } as any)
        .where(eq(materialsRequests.id, mr.id));

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: u.userId,
        action: "MATERIALS_REQUEST_DECLINED",
        entityType: "MaterialsRequest",
        entityId: mr.id,
        metadata: { jobId: mr.jobId } as any,
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

