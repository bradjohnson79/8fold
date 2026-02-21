import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { releasePmFunds } from "@/src/pm/releasePmFunds";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  pmRequestId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const result = await loadPmRouteContext(req, "JOB_POSTER");
    if (!result.ok) return result.response;

    const { ctx } = result;
    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const pm = await db
      .select({
        id: pmRequests.id,
        status: pmRequests.status,
        jobId: pmRequests.jobId,
        jobPosterUserId: pmRequests.jobPosterUserId,
      })
      .from(pmRequests)
      .where(
        and(
          eq(pmRequests.id, body.pmRequestId),
          eq(pmRequests.jobId, ctx.jobId),
          eq(pmRequests.jobPosterUserId, ctx.job.jobPosterUserId)
        )
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!pm) return NextResponse.json({ error: "Not found", traceId: ctx.traceId }, { status: 404 });
    if (pm.status === "RELEASED" || pm.status === "CLOSED") {
      return NextResponse.json({
        status: "CLOSED",
        alreadyReleased: true,
        idempotent: true,
        traceId: ctx.traceId,
      });
    }
    if (pm.status !== "VERIFIED") {
      return NextResponse.json(
        { error: "Request must be VERIFIED before releasing funds", traceId: ctx.traceId },
        { status: 400 }
      );
    }

    const released = await releasePmFunds({
      pmRequestId: body.pmRequestId,
      actorUserId: ctx.user.userId,
    });

    if (!released.ok) {
      if (released.code === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden", traceId: ctx.traceId }, { status: 403 });
      }
      if (released.code === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found", traceId: ctx.traceId }, { status: 404 });
      }
      return NextResponse.json(
        { error: released.reason, traceId: ctx.traceId },
        { status: 400 }
      );
    }

    logEvent({
      level: "info",
      event: "pm.release_funds",
      route: "/api/web/job/[jobId]/pm/release-funds",
      method: "POST",
      userId: ctx.user.userId,
      context: {
        pmRequestId: body.pmRequestId,
        releaseAmountCents: released.releaseAmountCents,
        remainderCents: released.remainderCents,
        alreadyReleased: released.alreadyReleased,
        traceId: ctx.traceId,
      },
    });

    return NextResponse.json({
      status: "CLOSED",
      releaseAmountCents: released.releaseAmountCents,
      remainderCents: released.remainderCents,
      alreadyReleased: released.alreadyReleased,
      idempotent: released.alreadyReleased,
      traceId: ctx.traceId,
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    logEvent({
      level: "error",
      event: "pm.release_funds_error",
      route: "/api/web/job/[jobId]/pm/release-funds",
      method: "POST",
      status,
      context: { error: message },
    });
    return NextResponse.json({ error: message }, { status });
  }
}
