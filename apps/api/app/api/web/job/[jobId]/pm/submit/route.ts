import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { pmLineItems } from "@/db/schema/pmLineItem";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { assertAllowedTransition, PMAllowedTransitions } from "@8fold/shared";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  pmRequestId: z.string().uuid(),
  manualTotal: z.number().min(0).optional(),
});

export async function POST(req: Request) {
  try {
    const result = await loadPmRouteContext(req, "CONTRACTOR");
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
        contractorId: pmRequests.contractorId,
        autoTotal: pmRequests.autoTotal,
      })
      .from(pmRequests)
      .where(
        and(
          eq(pmRequests.id, body.pmRequestId),
          eq(pmRequests.jobId, ctx.jobId),
          eq(pmRequests.contractorId, ctx.contractorId!)
        )
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!pm) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (pm.status === "SUBMITTED") {
      return NextResponse.json({ status: "SUBMITTED", idempotent: true, traceId: ctx.traceId });
    }
    assertAllowedTransition("PMRequest", pm.status as any, "SUBMITTED", PMAllowedTransitions);

    const lineCount = await db
      .select({ id: pmLineItems.id })
      .from(pmLineItems)
      .where(eq(pmLineItems.pmRequestId, body.pmRequestId))
      .then((r) => r.length);
    if (lineCount === 0) {
      return NextResponse.json({ error: "Add at least one line item before submitting" }, { status: 400 });
    }

    // Server-authoritative recalc; never trust frontend math.
    const taxAmount = await db
      .select({ taxAmount: pmRequests.taxAmount })
      .from(pmRequests)
      .where(eq(pmRequests.id, body.pmRequestId))
      .limit(1)
      .then((r) => Number(r[0]?.taxAmount ?? 0));
    const lineRows = await db
      .select({ lineTotal: pmLineItems.lineTotal })
      .from(pmLineItems)
      .where(eq(pmLineItems.pmRequestId, body.pmRequestId));
    const autoTotal = lineRows.reduce((sum, r) => sum + Number(r.lineTotal ?? 0), 0) + taxAmount;
    if (body.manualTotal != null) {
      if (body.manualTotal > autoTotal) {
        return NextResponse.json(
          { error: "INVALID_MANUAL_TOTAL", code: "INVALID_MANUAL_TOTAL", traceId: ctx.traceId },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const updated = await db
      .update(pmRequests)
      .set({
        autoTotal: String(autoTotal),
        status: "SUBMITTED",
        manualTotal: body.manualTotal != null ? String(body.manualTotal) : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(pmRequests.id, body.pmRequestId),
          inArray(pmRequests.status, ["DRAFT", "AMENDMENT_REQUESTED"] as any),
        ),
      )
      .returning({ id: pmRequests.id });
    if (!updated.length) {
      const already = await db
        .select({ status: pmRequests.status })
        .from(pmRequests)
        .where(eq(pmRequests.id, body.pmRequestId))
        .limit(1)
        .then((r) => r[0]?.status ?? null);
      if (already === "SUBMITTED") {
        return NextResponse.json({ status: "SUBMITTED", idempotent: true, traceId: ctx.traceId });
      }
      return NextResponse.json({ error: "Conflict", traceId: ctx.traceId }, { status: 409 });
    }

    logEvent({
      level: "info",
      event: "pm.submit",
      route: "/api/web/job/[jobId]/pm/submit",
      method: "POST",
      userId: ctx.user.userId,
      context: { pmRequestId: body.pmRequestId, traceId: ctx.traceId },
    });

    return NextResponse.json({ status: "SUBMITTED", traceId: ctx.traceId });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
