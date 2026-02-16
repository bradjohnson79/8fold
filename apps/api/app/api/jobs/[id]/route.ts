import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { optionalUser } from "../../../../src/auth/rbac";
import { toHttpError } from "../../../../src/http/errors";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../../db/schema/job";
import { jobPhotos } from "../../../../db/schema/jobPhoto";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1] ?? "";
}

export async function GET(req: Request) {
  try {
    const user = await optionalUser(req);
    const id = getIdFromUrl(req);

    const jobRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        title: jobs.title,
        scope: jobs.scope,
        region: jobs.region,
        serviceType: jobs.serviceType,
        timeWindow: jobs.timeWindow,
        routerEarningsCents: jobs.routerEarningsCents,
        brokerFeeCents: jobs.brokerFeeCents,
        contractorPayoutCents: jobs.contractorPayoutCents,
        laborTotalCents: jobs.laborTotalCents,
        materialsTotalCents: jobs.materialsTotalCents,
        transactionFeeCents: jobs.transactionFeeCents,
        routingStatus: jobs.routingStatus,
        jobType: jobs.jobType,
        publishedAt: jobs.publishedAt,
        routerId: jobs.claimedByUserId, // Prisma `routerId` @map("claimedByUserId")
        claimedAt: jobs.claimedAt,
        routedAt: jobs.routedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);

    const jobBase = jobRows[0] ?? null;
    if (!jobBase) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const photos = await db
      .select({
        id: jobPhotos.id,
        kind: jobPhotos.kind,
        url: jobPhotos.url,
        storageKey: jobPhotos.storageKey,
      })
      .from(jobPhotos)
      .where(eq(jobPhotos.jobId, id));

    const job = { ...jobBase, photos };

    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isClaimedByYou = !!user && job.routerId === user.userId;
    const canClaim = !!user && user.role === "ROUTER" && job.status === "PUBLISHED" && job.routingStatus === "UNROUTED" && !job.routerId;
    const canRouteConfirm =
      !!user && isClaimedByYou && user.role === "ROUTER" && job.status === "PUBLISHED" && !job.routedAt;

    // Never return user IDs to the mobile app.
    const { routerId: _omit, ...safeJob } = job;

    return NextResponse.json({
      job: safeJob,
      actions: { isClaimedByYou, canClaim, canRouteConfirm }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

