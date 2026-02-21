import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { pmLineItems } from "@/db/schema/pmLineItem";
import { pmReceipts } from "@/db/schema/pmReceipt";
import { loadPmRouteContextAny } from "@/src/pm/routeHelpers";
import { toHttpError } from "@/src/http/errors";

/**
 * GET: List PM requests for the job.
 * Contractor and Job Poster can both list (role is validated in loadPmRouteContext).
 * We use CONTRACTOR role to allow both - actually we need to allow both. Let me check.
 *
 * The loadPmRouteContext requires a specific role. For listing, both contractor and poster
 * should see the requests. We need a variant that allows either. Let me add a "ANY" role
 * that validates job is IN_PROGRESS and user is either contractor or poster.
 */
export async function GET(req: Request) {
  try {
    const result = await loadPmRouteContextAny(req);
    if (!result.ok) return result.response;

    const { ctx } = result;

    const requests = await db
      .select({
        id: pmRequests.id,
        status: pmRequests.status,
        autoTotal: pmRequests.autoTotal,
        manualTotal: pmRequests.manualTotal,
        approvedTotal: pmRequests.approvedTotal,
        taxAmount: pmRequests.taxAmount,
        currency: pmRequests.currency,
        stripePaymentIntentId: pmRequests.stripePaymentIntentId,
        escrowId: pmRequests.escrowId,
        amendReason: pmRequests.amendReason,
        proposedBudget: pmRequests.proposedBudget,
        initiatedBy: pmRequests.initiatedBy,
        createdAt: pmRequests.createdAt,
        updatedAt: pmRequests.updatedAt,
      })
      .from(pmRequests)
      .where(eq(pmRequests.jobId, ctx.jobId))
      .orderBy(desc(pmRequests.createdAt));

    const withItems = await Promise.all(
      requests.map(async (r) => {
        const items = await db
          .select({
            id: pmLineItems.id,
            description: pmLineItems.description,
            quantity: pmLineItems.quantity,
            unitPrice: pmLineItems.unitPrice,
            lineTotal: pmLineItems.lineTotal,
          })
          .from(pmLineItems)
          .where(eq(pmLineItems.pmRequestId, r.id));
        const receipts = await db
          .select({
            id: pmReceipts.id,
            extractedTotal: pmReceipts.extractedTotal,
            verified: pmReceipts.verified,
          })
          .from(pmReceipts)
          .where(eq(pmReceipts.pmRequestId, r.id));
        return { ...r, lineItems: items, receipts };
      })
    );

    return NextResponse.json({ requests: withItems });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
