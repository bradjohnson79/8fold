import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { pmReceipts } from "@/db/schema/pmReceipt";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  pmRequestId: z.string().uuid(),
  fileBase64: z.string().min(1).max(10_000_000),
  extractedTotal: z.number().min(0).optional(),
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

    if (!pm) return NextResponse.json({ error: "Not found", traceId: ctx.traceId }, { status: 404 });
    if (pm.status !== "FUNDED" && pm.status !== "RECEIPTS_SUBMITTED") {
      return NextResponse.json({ error: "Receipts can only be uploaded when request is FUNDED", traceId: ctx.traceId }, { status: 400 });
    }

    const receiptId = randomUUID();
    await db.insert(pmReceipts).values({
      id: receiptId,
      pmRequestId: body.pmRequestId,
      fileBase64: body.fileBase64,
      extractedTotal: body.extractedTotal != null ? String(body.extractedTotal) : null,
      verified: false,
    });

    await db
      .update(pmRequests)
      .set({
        status: "RECEIPTS_SUBMITTED",
        updatedAt: new Date(),
      })
      .where(eq(pmRequests.id, body.pmRequestId));

    logEvent({
      level: "info",
      event: "pm.upload_receipt",
      route: "/api/web/job/[jobId]/pm/upload-receipt",
      method: "POST",
      userId: ctx.user.userId,
      context: { pmRequestId: body.pmRequestId, receiptId, traceId: ctx.traceId },
    });

    return NextResponse.json({ receiptId, status: "RECEIPTS_SUBMITTED", traceId: ctx.traceId });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
