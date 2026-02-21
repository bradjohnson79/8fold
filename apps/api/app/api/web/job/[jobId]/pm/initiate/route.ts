import { NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";

export async function POST(req: Request) {
  try {
    const result = await loadPmRouteContext(req, "CONTRACTOR");
    if (!result.ok) return result.response;

    const { ctx } = result;
    const { jobId, contractorId, traceId } = ctx;
    if (!contractorId) {
      return NextResponse.json({ error: "Contractor not found" }, { status: 403 });
    }

    const currency = "USD";
    // Server-side guard: only one active PM request per job.
    const existingActive = await db
      .select({ id: pmRequests.id, status: pmRequests.status })
      .from(pmRequests)
      .where(
        and(
          eq(pmRequests.jobId, jobId),
          notInArray(pmRequests.status, ["RELEASED", "CLOSED", "REJECTED"] as any),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);
    if (existingActive) {
      return NextResponse.json(
        {
          error: "PM_REQUEST_ALREADY_ACTIVE",
          code: "PM_REQUEST_ALREADY_ACTIVE",
          pmRequestId: existingActive.id,
          traceId,
        },
        { status: 409 },
      );
    }

    let inserted: { id: string } | undefined;
    try {
      [inserted] = await db
        .insert(pmRequests)
        .values({
          id: randomUUID(),
          jobId,
          contractorId,
          jobPosterUserId: ctx.job.jobPosterUserId,
          initiatedBy: "CONTRACTOR",
          status: "DRAFT",
          autoTotal: "0",
          currency,
        })
        .returning({ id: pmRequests.id });
    } catch {
      // Race safety with unique index fallback.
      const raced = await db
        .select({ id: pmRequests.id })
        .from(pmRequests)
        .where(
          and(
            eq(pmRequests.jobId, jobId),
            notInArray(pmRequests.status, ["RELEASED", "CLOSED", "REJECTED"] as any),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null);
      if (raced) {
        return NextResponse.json(
          {
            error: "PM_REQUEST_ALREADY_ACTIVE",
            code: "PM_REQUEST_ALREADY_ACTIVE",
            pmRequestId: raced.id,
            traceId,
          },
          { status: 409 },
        );
      }
      throw Object.assign(new Error("Failed to create PM request"), { status: 500 });
    }

    if (!inserted) {
      throw Object.assign(new Error("Failed to create PM request"), { status: 500 });
    }

    logEvent({
      level: "info",
      event: "pm.initiate",
      route: "/api/web/job/[jobId]/pm/initiate",
      method: "POST",
      userId: ctx.user.userId,
      context: { jobId, pmRequestId: inserted.id, traceId },
    });

    return NextResponse.json({ pmRequestId: inserted.id, status: "DRAFT", traceId });
  } catch (err) {
    const { status, message } = toHttpError(err);
    logEvent({
      level: "error",
      event: "pm.initiate_error",
      route: "/api/web/job/[jobId]/pm/initiate",
      method: "POST",
      status,
      context: { error: message },
    });
    return NextResponse.json({ error: message }, { status });
  }
}
