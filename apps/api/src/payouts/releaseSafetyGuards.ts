export function isRefundInitiatedOrCompleteJobPayment(input: {
  status?: string | null;
  refundedAt?: Date | string | null;
  refundIssuedAt?: Date | string | null;
}): { blocked: boolean; reason: string | null } {
  const status = String(input.status ?? "").trim().toUpperCase();
  const refunded = Boolean(input.refundedAt);
  const issued = Boolean(input.refundIssuedAt);

  if (status === "REFUNDED") return { blocked: true, reason: "REFUNDED" };
  if (refunded) return { blocked: true, reason: "refundedAt_set" };
  if (issued) return { blocked: true, reason: "refundIssuedAt_set" };

  return { blocked: false, reason: null };
}

