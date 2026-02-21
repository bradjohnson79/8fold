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
  amendReason: z.string().trim().min(1).max(2000),
  proposedBudget: z.number().min(0).max(999999.99),
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

    assertAllowedTransition("PMRequest", pm.status as any, "AMENDMENT_REQUESTED", PMAllowedTransitions);

    const now = new Date();
    await db
      .update(pmRequests)
      .set({
        status: "AMENDMENT_REQUESTED",
        amendReason: body.amendReason,
        proposedBudget: String(body.proposedBudget),
        updatedAt: now,
      })
      .where(eq(pmRequests.id, body.pmRequestId));

    logEvent({
      level: "info",
      event: "pm.amend",
      route: "/api/web/job/[jobId]/pm/amend",
      method: "POST",
      userId: ctx.user.userId,
      context: { pmRequestId: body.pmRequestId, traceId: ctx.traceId },
    });

    return NextResponse.json({ status: "AMENDMENT_REQUESTED" });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
