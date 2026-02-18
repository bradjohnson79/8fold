import type Stripe from "stripe";
import { isAllowedTransferRecordStatusTransition, type TransferRecordStatus } from "./transferStatusTransitions";

export function desiredTransferRecordStatusFromStripeTransfer(transfer: Pick<Stripe.Transfer, "reversed" | "amount_reversed">): TransferRecordStatus {
  const reversed = Boolean((transfer as any)?.reversed) || Number((transfer as any)?.amount_reversed ?? 0) > 0;
  return reversed ? "REVERSED" : "SENT";
}

export type ReconcilePlan =
  | { kind: "noop"; from: TransferRecordStatus; to: TransferRecordStatus; steps: [] }
  | { kind: "illegal"; from: TransferRecordStatus; to: TransferRecordStatus; steps: [] }
  | { kind: "update"; from: TransferRecordStatus; to: TransferRecordStatus; steps: Array<{ from: TransferRecordStatus; to: TransferRecordStatus }> };

export function buildTransferRecordReconcilePlan(from: TransferRecordStatus, to: TransferRecordStatus): ReconcilePlan {
  const f = from;
  const t = to;
  if (f === t) return { kind: "noop", from: f, to: t, steps: [] };

  // Special case: Stripe may indicate reversed while our DB row is still PENDING (webhook ordering).
  // We only permit reconciliation via legal transitions.
  if (f === "PENDING" && t === "REVERSED") {
    return {
      kind: "update",
      from: f,
      to: t,
      steps: [
        { from: "PENDING", to: "SENT" },
        { from: "SENT", to: "REVERSED" },
      ],
    };
  }

  if (!isAllowedTransferRecordStatusTransition(f, t)) {
    return { kind: "illegal", from: f, to: t, steps: [] };
  }

  return { kind: "update", from: f, to: t, steps: [{ from: f, to: t }] };
}

