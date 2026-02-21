import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { pmLineItems } from "@/db/schema/pmLineItem";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";

const BodySchema = z.object({
  pmRequestId: z.string().uuid(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(9999),
  unitPrice: z.number().min(0).max(999999.99),
  url: z.string().url().max(500).optional(),
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

    if (!pm) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (pm.status !== "DRAFT" && pm.status !== "AMENDMENT_REQUESTED") {
      return NextResponse.json({ error: "Can only add line items to DRAFT or AMENDMENT_REQUESTED requests" }, { status: 400 });
    }

    const lineTotal = Number((body.quantity * body.unitPrice).toFixed(2));
    const lineItemId = randomUUID();
    await db.insert(pmLineItems).values({
      id: lineItemId,
      pmRequestId: body.pmRequestId,
      description: body.description,
      quantity: body.quantity,
      unitPrice: String(body.unitPrice),
      url: body.url ?? null,
      lineTotal: String(lineTotal),
    });

    const pmWithTax = await db
      .select({ taxAmount: pmRequests.taxAmount })
      .from(pmRequests)
      .where(eq(pmRequests.id, body.pmRequestId))
      .limit(1)
      .then((r) => r[0]);
    const taxAmount = Number(pmWithTax?.taxAmount ?? 0);
    const lineRows = await db
      .select({ lineTotal: pmLineItems.lineTotal })
      .from(pmLineItems)
      .where(eq(pmLineItems.pmRequestId, body.pmRequestId));
    const itemsTotal = lineRows.reduce((sum, r) => sum + Number(r.lineTotal ?? 0), 0);
    const newAutoTotal = itemsTotal + taxAmount;

    await db
      .update(pmRequests)
      .set({
        autoTotal: String(newAutoTotal),
        updatedAt: new Date(),
      })
      .where(eq(pmRequests.id, body.pmRequestId));

    logEvent({
      level: "info",
      event: "pm.add_line_item",
      route: "/api/web/job/[jobId]/pm/add-line-item",
      method: "POST",
      userId: ctx.user.userId,
      context: { pmRequestId: body.pmRequestId, lineItemId, traceId: ctx.traceId },
    });

    return NextResponse.json({
      lineItemId,
      lineTotal,
      autoTotal: newAutoTotal,
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
