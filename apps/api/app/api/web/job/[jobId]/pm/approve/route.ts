import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { assertAllowedTransition, PMAllowedTransitions } from "@8fold/shared";
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
        autoTotal: pmRequests.autoTotal,
        manualTotal: pmRequests.manualTotal,
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

    if (!pm) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (pm.status === "APPROVED") {
      const approvedTotal = pm.manualTotal != null ? Number(pm.manualTotal) : Number(pm.autoTotal ?? 0);
      return NextResponse.json({ status: "APPROVED", approvedTotal, idempotent: true, traceId: ctx.traceId });
    }

    assertAllowedTransition("PMRequest", pm.status as any, "APPROVED", PMAllowedTransitions);

    const approvedTotal = pm.manualTotal != null ? Number(pm.manualTotal) : Number(pm.autoTotal ?? 0);
    const now = new Date();
    const updated = await db
      .update(pmRequests)
      .set({
        status: "APPROVED",
        approvedTotal: String(approvedTotal),
        updatedAt: now,
      })
      .where(and(eq(pmRequests.id, body.pmRequestId), eq(pmRequests.status, "SUBMITTED" as any)))
      .returning({ id: pmRequests.id });
    if (!updated.length) {
      const latest = await db
        .select({ status: pmRequests.status, approvedTotal: pmRequests.approvedTotal })
        .from(pmRequests)
        .where(eq(pmRequests.id, body.pmRequestId))
        .limit(1)
        .then((r) => r[0] ?? null);
      if (latest?.status === "APPROVED") {
        return NextResponse.json({
          status: "APPROVED",
          approvedTotal: Number(latest.approvedTotal ?? approvedTotal),
          idempotent: true,
          traceId: ctx.traceId,
        });
      }
      return NextResponse.json({ error: "Conflict", traceId: ctx.traceId }, { status: 409 });
    }

    logEvent({
      level: "info",
      event: "pm.approve",
      route: "/api/web/job/[jobId]/pm/approve",
      method: "POST",
      userId: ctx.user.userId,
      context: { pmRequestId: body.pmRequestId, approvedTotal, traceId: ctx.traceId },
    });

    return NextResponse.json({ status: "APPROVED", approvedTotal, traceId: ctx.traceId });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
