import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/server/db/drizzle";
import { transferRecords } from "@/db/schema/transferRecord";
import { desiredTransferRecordStatusFromStripeTransfer, buildTransferRecordReconcilePlan } from "@/src/payouts/stripeTransferReconcile";
import { type TransferRecordStatus } from "@/src/payouts/transferStatusTransitions";
import { logEvent } from "@/src/server/observability/log";
import type Stripe from "stripe";

function requireStripe() {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  return stripe;
}

function getTransferIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../finance/transfers/:transferId/reconcile
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const transferId = getTransferIdFromUrl(req);
  if (!transferId) return NextResponse.json({ ok: false, error: "invalid_transfer_id" }, { status: 400 });

  try {
    const s = requireStripe();

    const transfer: Stripe.Transfer = await s.transfers.retrieve(transferId);
    const desired = desiredTransferRecordStatusFromStripeTransfer(transfer);

    // Locate TransferRecord by Stripe transfer id. Do not create anything.
    const existing = await db
      .select({
        id: transferRecords.id,
        jobId: transferRecords.jobId,
        status: transferRecords.status,
        failureReason: transferRecords.failureReason,
        releasedAt: transferRecords.releasedAt,
        method: transferRecords.method,
        role: transferRecords.role,
        amountCents: transferRecords.amountCents,
        currency: transferRecords.currency,
        stripeTransferId: transferRecords.stripeTransferId,
        externalRef: transferRecords.externalRef,
      })
      .from(transferRecords)
      .where(and(eq(transferRecords.method, "STRIPE" as any), eq(transferRecords.stripeTransferId, transferId)))
      .limit(1);

    const row = existing[0] ?? null;
    if (!row?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "transfer_record_not_found",
          data: {
            transferId,
            stripe: {
              id: transfer.id,
              reversed: Boolean((transfer as any).reversed),
              amount: transfer.amount,
              currency: transfer.currency,
              destination:
                typeof (transfer as any).destination === "string" ? (transfer as any).destination : (transfer as any).destination?.id ?? null,
              created: transfer.created,
              metadata: (transfer as any).metadata ?? null,
            },
          },
        },
        { status: 404 },
      );
    }

    const fromStatus = String(row.status ?? "").toUpperCase() as TransferRecordStatus;
    const plan = buildTransferRecordReconcilePlan(fromStatus, desired);

    if (plan.kind === "illegal") {
      logEvent({
        level: "error",
        event: "admin.transfer_reconcile_illegal_transition",
        route: "/api/admin/finance/transfers/[transferId]/reconcile",
        method: "POST",
        status: 409,
        userId: auth.userId,
        code: "TRANSFER_STATUS_TRANSITION_ILLEGAL",
        context: { transferId, jobId: String(row.jobId ?? ""), fromStatus, toStatus: desired },
      });
      return NextResponse.json(
        { ok: false, error: "illegal_transition", data: { transferId, jobId: String(row.jobId ?? ""), fromStatus, toStatus: desired } },
        { status: 409 },
      );
    }

    if (plan.kind === "noop") {
      return NextResponse.json(
        { ok: true, data: { transferId, jobId: String(row.jobId ?? ""), before: row, after: row, desired, changed: false } },
        { status: 200 },
      );
    }

    const after = await db.transaction(async (tx: any) => {
      // Lock the row for deterministic reconciliation.
      await tx.execute(sql`select "id" from "8fold_test"."TransferRecord" where "id" = ${row.id}::uuid for update`);

      let current: TransferRecordStatus = fromStatus;
      for (const step of plan.steps) {
        const updated = await tx
          .update(transferRecords)
          .set({ status: step.to as any, failureReason: step.to === "SENT" ? null : String(row.failureReason ?? null) } as any)
          .where(and(eq(transferRecords.id, row.id), eq(transferRecords.status, step.from as any)))
          .returning({ status: transferRecords.status });
        if (!updated[0]?.status) break;
        current = String(updated[0].status ?? "").toUpperCase() as any;
      }
      const rows = await tx
        .select({
          id: transferRecords.id,
          jobId: transferRecords.jobId,
          status: transferRecords.status,
          failureReason: transferRecords.failureReason,
          releasedAt: transferRecords.releasedAt,
          method: transferRecords.method,
          role: transferRecords.role,
          amountCents: transferRecords.amountCents,
          currency: transferRecords.currency,
          stripeTransferId: transferRecords.stripeTransferId,
          externalRef: transferRecords.externalRef,
        })
        .from(transferRecords)
        .where(eq(transferRecords.id, row.id))
        .limit(1);
      return { status: current, row: rows[0] ?? null };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          transferId,
          jobId: String(row.jobId ?? ""),
          before: row,
          after: after.row ?? { ...row, status: after.status },
          desired,
          changed: String((after.row as any)?.status ?? after.status) !== fromStatus,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return handleApiError(err, "POST /api/admin/finance/transfers/:transferId/reconcile", { userId: auth.userId });
  }
}

