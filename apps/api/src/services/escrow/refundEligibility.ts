const REFUND_WINDOW_DAYS = 7;

type RefundEligibilityInput = {
  status: string;
  paymentStatus: string;
  contractorUserId: string | null;
  hasActiveAssignment: boolean;
  stripePaidAt: Date | null;
  stripeRefundedAt: Date | null;
  now: Date;
};

export type RefundEligibility =
  | { eligible: true; eligibleAt: Date }
  | { eligible: false; code: "ALREADY_REFUNDED" | "NOT_PAID" | "ASSIGNED" | "NOT_ROUTABLE" | "REFUND_WINDOW_NOT_REACHED"; eligibleAt?: Date };

export type RefundIneligibleCode = Extract<RefundEligibility, { eligible: false }>['code'];

export function getUnassignedRefundEligibility(input: RefundEligibilityInput): RefundEligibility {
  const status = String(input.status ?? "").toUpperCase();
  const paymentStatus = String(input.paymentStatus ?? "").toUpperCase();

  if (input.stripeRefundedAt instanceof Date || paymentStatus === "REFUNDED") {
    return { eligible: false, code: "ALREADY_REFUNDED" };
  }
  if (!['FUNDS_SECURED', 'FUNDED'].includes(paymentStatus) || !(input.stripePaidAt instanceof Date)) {
    return { eligible: false, code: "NOT_PAID" };
  }
  if (status !== "OPEN_FOR_ROUTING") {
    return { eligible: false, code: "NOT_ROUTABLE" };
  }
  if (input.contractorUserId || input.hasActiveAssignment) {
    return { eligible: false, code: "ASSIGNED" };
  }

  const eligibleAt = new Date(input.stripePaidAt.getTime() + REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (input.now.getTime() < eligibleAt.getTime()) {
    return { eligible: false, code: "REFUND_WINDOW_NOT_REACHED", eligibleAt };
  }

  return { eligible: true, eligibleAt };
}

export function getRefundWindowDays() {
  return REFUND_WINDOW_DAYS;
}
