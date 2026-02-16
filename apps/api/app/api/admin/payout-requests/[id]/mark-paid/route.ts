import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { getWalletTotals } from "../../../../../../src/wallet/totals";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { ledgerEntries } from "../../../../../../db/schema/ledgerEntry";
import { payoutRequests } from "../../../../../../db/schema/payoutRequest";
import { payouts } from "../../../../../../db/schema/payout";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../payout-requests/:id/mark-paid
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  externalReference: z.string().trim().min(1).optional(),
  notesInternal: z.string().trim().min(1).optional()
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const payoutRequestId = getIdFromUrl(req);
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }

    const result = await db.transaction(async (tx: any) => {
      const prRows = await tx
        .select({
          id: payoutRequests.id,
          status: payoutRequests.status,
          userId: payoutRequests.userId,
          amountCents: payoutRequests.amountCents,
          payoutId: payoutRequests.payoutId,
        })
        .from(payoutRequests)
        .where(eq(payoutRequests.id, payoutRequestId))
        .limit(1);
      const pr = prRows[0] ?? null;
      if (!pr) return { kind: "not_found" as const };
      if (pr.status !== "REQUESTED") return { kind: "not_requestable" as const, status: pr.status };
      if (pr.payoutId) return { kind: "already_paid" as const };

      const totals = await getWalletTotals(pr.userId);
      if (pr.amountCents > totals.AVAILABLE) {
        return { kind: "insufficient" as const, available: totals.AVAILABLE };
      }

      const now = new Date();
      const payoutCreated = await tx
        .insert(payouts)
        .values({
          id: crypto.randomUUID(),
          paidAt: now,
          externalReference: body.data.externalReference ?? null,
          notesInternal: body.data.notesInternal ?? null,
        } as any)
        .returning();
      const payout = payoutCreated[0] as any;

      const updatedRows = await tx
        .update(payoutRequests)
        .set({ status: "PAID", payoutId: payout.id } as any)
        .where(and(eq(payoutRequests.id, payoutRequestId), eq(payoutRequests.status, "REQUESTED"), sql`${payoutRequests.payoutId} is null`))
        .returning();
      const updated = updatedRows[0] ?? null;
      if (!updated) return { kind: "not_requestable" as const, status: "UNKNOWN" };

      // Ledger movement: AVAILABLE -> PAID (append-only).
      await tx.insert(ledgerEntries).values([
        {
          id: crypto.randomUUID(),
          userId: pr.userId,
          type: "PAYOUT",
          direction: "DEBIT",
          bucket: "AVAILABLE",
          amountCents: pr.amountCents,
          memo: "Payout processed (manual)",
        },
        {
          id: crypto.randomUUID(),
          userId: pr.userId,
          type: "PAYOUT",
          direction: "CREDIT",
          bucket: "PAID",
          amountCents: pr.amountCents,
          memo: "Payout processed (manual)",
        },
      ] as any);

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "PAYOUT_REQUEST_MARK_PAID",
        entityType: "PayoutRequest",
        entityId: payoutRequestId,
        metadata: {
          amountCents: pr.amountCents,
          payoutId: payout.id,
          externalReference: body.data.externalReference,
        } as any,
      });

      return { kind: "ok" as const, payoutRequest: updated, payout };
    });

    if (result.kind === "not_found") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (result.kind === "already_paid") return NextResponse.json({ ok: false, error: "already_paid" }, { status: 409 });
    if (result.kind === "not_requestable") return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 409 });
    if (result.kind === "insufficient") {
      return NextResponse.json(
        { ok: false, error: "insufficient_balance", available: result.available },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, data: { payoutRequest: result.payoutRequest, payout: result.payout } });
  } catch (err) {
    await adminAuditLog(req, auth, {
      action: "PAYOUT_REQUEST_MARK_PAID_ERROR",
      entityType: "PayoutRequest",
      entityId: getIdFromUrl(req) || "unknown",
      outcome: "ERROR",
      error: err instanceof Error ? err.message : "error",
    });
    return handleApiError(err, "POST /api/admin/payout-requests/[id]/mark-paid");
  }
}

