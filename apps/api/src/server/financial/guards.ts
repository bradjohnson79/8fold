export type EscrowStatus = "PENDING" | "FUNDED" | "RELEASED" | "REFUNDED" | "FAILED";

export function assertValidEscrowTransition(from: EscrowStatus, to: EscrowStatus): void {
  const ok =
    (from === "PENDING" && (to === "FUNDED" || to === "FAILED")) ||
    (from === "FUNDED" && (to === "RELEASED" || to === "REFUNDED"));

  if (!ok) {
    throw { status: 400, message: "Invalid escrow transition" };
  }
}

