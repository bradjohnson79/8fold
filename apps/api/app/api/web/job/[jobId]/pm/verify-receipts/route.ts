import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { pmReceipts } from "@/db/schema/pmReceipt";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { assertAllowedTransition, PMAllowedTransitions } from "@8fold/shared";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  pmRequestId: z.string().uuid(),
  manualTotals: z.record(z.string().uuid(), z.number().min(0)).optional(),
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
        approvedTotal: pmRequests.approvedTotal,
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
    if (pm.status === "VERIFIED" || pm.status === "RELEASED" || pm.status === "CLOSED") {
      return NextResponse.json({ status: "VERIFIED", idempotent: true, traceId: ctx.traceId });
    }
    assertAllowedTransition("PMRequest", pm.status as any, "VERIFIED", PMAllowedTransitions);

    const receiptRows = await db
      .select({
        id: pmReceipts.id,
        extractedTotal: pmReceipts.extractedTotal,
      })
      .from(pmReceipts)
      .where(eq(pmReceipts.pmRequestId, body.pmRequestId));

    if (receiptRows.length === 0) {
      return NextResponse.json({ error: "No receipts to verify", traceId: ctx.traceId }, { status: 400 });
    }

    const receiptTotal = receiptRows.reduce((sum, r) => {
      const manual = body.manualTotals?.[r.id];
      const val = manual != null ? manual : Number(r.extractedTotal ?? 0);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);
    const approvedTotal = Number(pm.approvedTotal ?? 0);
    const releaseAmount = Math.min(receiptTotal, approvedTotal);

    await db
      .update(pmReceipts)
      .set({ verified: true })
      .where(eq(pmReceipts.pmRequestId, body.pmRequestId));

    const now = new Date();
    await db
      .update(pmRequests)
      .set({
        status: "VERIFIED",
        updatedAt: now,
      })
      .where(eq(pmRequests.id, body.pmRequestId));

    logEvent({
      level: "info",
      event: "pm.verify_receipts",
      route: "/api/web/job/[jobId]/pm/verify-receipts",
      method: "POST",
      userId: ctx.user.userId,
      context: {
        pmRequestId: body.pmRequestId,
        receiptTotal,
        releaseAmount,
        traceId: ctx.traceId,
      },
    });

    return NextResponse.json({
      status: "VERIFIED",
      receiptTotal,
      releaseAmount,
      traceId: ctx.traceId,
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
